import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException, status

def calculate_estimated_wait(people_ahead: int, db: sqlite3.Connection = None, service_id: str = None) -> int:
    """
    Calculates dynamic wait time in minutes based on rolling historical service duration,
    service capacity, and cold-start fallback.
    """
    if db is not None and service_id is not None:
        from app.services import queue_service
        return queue_service.calculate_dynamic_wait_time(db, service_id, people_ahead)
    return people_ahead * 5

def book_token(
    db: sqlite3.Connection,
    user_id: str,
    user_name: str,
    user_email: str,
    service_id: str,
    counter_id: str = None
) -> dict:
    """
    Atomically books a new queue token for a service and counter.
    Supports automatic multi-counter load balancing if counter_id is omitted.
    Runs inside a strict SQLite BEGIN IMMEDIATE transaction boundary.
    """
    from app.services import queue_service

    cursor = db.cursor()
    try:
        # Enforce write lock immediately to prevent sequence and active booking races
        db.execute("BEGIN IMMEDIATE;")

        # 1. Verify service exists
        cursor.execute("SELECT name, code FROM services WHERE id = ?;", (service_id,))
        service = cursor.fetchone()
        if not service:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Service not found"
            )

        # 2. Multi-counter load balancing or explicit counter validation
        if not counter_id:
            # Auto load balancing: pick counter with lowest load
            target_counter_id = queue_service.select_best_counter_for_service(db, service_id)
        else:
            target_counter_id = counter_id
            cursor.execute("SELECT status, name FROM counters WHERE id = ? AND service_id = ?;", (target_counter_id, service_id))
            counter = cursor.fetchone()
            if not counter:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Counter not found for this service"
                )
            
            if counter["status"] in ("CLOSED", "MAINTENANCE"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Counter is currently not accepting new tokens"
                )

        # 3. Check for any existing active token (global check matching Express Reference)
        cursor.execute("""
            SELECT id FROM tokens 
            WHERE student_id = ? AND status IN ('WAITING', 'SERVING', 'HELD');
        """, (user_id,))
        active_token = cursor.fetchone()
        if active_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have an active token. Complete or cancel it first."
            )

        # 4. Generate unique sequential token number (e.g. LP-046, LIB-051)
        cursor.execute("""
            SELECT token_number FROM tokens 
            WHERE service_id = ? AND token_number LIKE ?;
        """, (service_id, f"{service['code']}-%"))
        existing_tokens = cursor.fetchall()
        max_num = 0
        for row in existing_tokens:
            t_num = row["token_number"]
            try:
                parts = t_num.split("-")
                if len(parts) >= 2 and parts[-1].isdigit():
                    num = int(parts[-1])
                    if num > max_num:
                        max_num = num
            except Exception:
                pass
                
        if max_num == 0 and len(existing_tokens) > 0:
            max_num = len(existing_tokens)

        seq_num = str(max_num + 1).zfill(3)
        token_number = f"{service['code']}-{seq_num}"
        token_id = str(uuid.uuid4())

        # 5. Insert new token with high-precision timestamp to avoid same-second queue collisions in SQLite
        created_at_val = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        cursor.execute("""
            INSERT INTO tokens (id, token_number, student_id, student_name, student_email, service_id, counter_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?);
        """, (token_id, token_number, user_id, user_name, user_email, service_id, target_counter_id, created_at_val))

        db.commit()

        # 6. Retrieve complete token details (including names) for response payload
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.id = ?;
        """, (token_id,))
        new_token = dict(cursor.fetchone())
        
        # Populate real-time queue position and dynamic wait stats
        details = queue_service.get_token_position_details(db, token_id)
        if details:
            new_token["people_ahead"] = details["people_ahead"]
            new_token["estimated_wait_time"] = details["estimated_wait_time"]
        else:
            new_token["people_ahead"] = 0
            new_token["estimated_wait_time"] = 0
            
        return new_token

    except HTTPException:
        db.rollback()
        raise
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error: {str(e)}"
        )

def get_active_token(db: sqlite3.Connection, user_id: str) -> dict | None:
    """
    Retrieves the current active token (WAITING, SERVING, HELD) for a student,
    including real-time queue position and dynamic wait estimates.
    """
    cursor = db.cursor()
    try:
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.student_id = ? AND t.status IN ('WAITING', 'SERVING', 'HELD')
            ORDER BY t.created_at DESC
            LIMIT 1;
        """, (user_id,))
        row = cursor.fetchone()
        if not row:
            return None
            
        token = dict(row)
        
        from app.services import queue_service
        details = queue_service.get_token_position_details(db, token["id"])
        if details:
            token["people_ahead"] = details["people_ahead"]
            token["estimated_wait_time"] = details["estimated_wait_time"]
        else:
            token["people_ahead"] = 0
            token["estimated_wait_time"] = 0
            
        return token
        
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query error: {str(e)}"
        )

def get_token_history(db: sqlite3.Connection, user_id: str) -> list:
    """
    Retrieves past completed, skipped, or cancelled tokens for a student.
    """
    cursor = db.cursor()
    try:
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.student_id = ? AND t.status IN ('COMPLETED', 'CANCELLED', 'SKIPPED')
            ORDER BY t.created_at DESC;
        """, (user_id,))
        return [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query error: {str(e)}"
        )

def cancel_token(db: sqlite3.Connection, user_id: str, token_id: str) -> dict:
    """
    Cancels a student's active waiting or held token.
    Enforces ownership and state transitions.
    """
    cursor = db.cursor()
    try:
        cursor.execute("""
            SELECT student_id, status, counter_id, service_id, token_number
            FROM tokens 
            WHERE id = ?;
        """, (token_id,))
        token = cursor.fetchone()
        
        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Token not found"
            )
            
        if token["student_id"] != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: You do not own this token"
            )
            
        if token["status"] not in ("WAITING", "HELD"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel token with status: {token['status']}"
            )
            
        now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        cursor.execute("""
            UPDATE tokens 
            SET status = 'CANCELLED', completed_at = ?
            WHERE id = ?;
        """, (now, token_id))
        db.commit()
        
        return {
            "success": True,
            "message": "Token cancelled successfully",
            "token": {
                "id": token_id,
                "token_number": token["token_number"],
                "service_id": token["service_id"],
                "counter_id": token["counter_id"]
            }
        }
        
    except HTTPException:
        db.rollback()
        raise
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database mutation error: {str(e)}"
        )
