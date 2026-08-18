import sqlite3
import hashlib
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException, status

def hash_password(password: str) -> str:
    """
    PBKDF2 SHA512 password hashing using salt 'queuecraft_salt_2026' to match seed/Node reference.
    """
    salt = b"queuecraft_salt_2026"
    key = hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt, 1000, dklen=64)
    return key.hex()

def generate_id(prefix: str) -> str:
    """
    Generates short prefixed IDs matching project format (e.g. usr-1234abcd, srv-1234abcd).
    """
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# 1. Dashboard Statistics
def get_dashboard_stats(db: sqlite3.Connection) -> dict:
    cursor = db.cursor()
    
    cursor.execute("SELECT COUNT(*) as cnt FROM services;")
    services_count = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM counters WHERE status != 'CLOSED';")
    active_counters = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE status = 'WAITING';")
    waiting_tokens = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE status = 'SERVING';")
    serving_tokens = cursor.fetchone()["cnt"]
    
    cursor.execute("""
        SELECT COUNT(*) as cnt FROM tokens 
        WHERE status = 'COMPLETED' AND date(completed_at) = date('now');
    """)
    completed_today = cursor.fetchone()["cnt"]
    
    cursor.execute("""
        SELECT COUNT(*) as cnt FROM tokens 
        WHERE status = 'SKIPPED' AND date(skipped_at) = date('now');
    """)
    skipped_today = cursor.fetchone()["cnt"]
    
    cursor.execute("""
        SELECT COUNT(*) as cnt FROM tokens 
        WHERE status = 'CANCELLED' AND date(created_at) = date('now');
    """)
    cancelled_today = cursor.fetchone()["cnt"]
    
    cursor.execute("""
        SELECT AVG((julianday(started_at) - julianday(created_at)) * 24 * 60) as avg_mins 
        FROM tokens 
        WHERE started_at IS NOT NULL;
    """)
    avg_row = cursor.fetchone()
    avg_mins = avg_row["avg_mins"] if avg_row and avg_row["avg_mins"] is not None else 0.0
    avg_waiting_time = round(avg_mins, 1)
    
    return {
        "services_count": services_count,
        "active_counters_count": active_counters,
        "waiting_tokens_count": waiting_tokens,
        "currently_serving_count": serving_tokens,
        "completed_today_count": completed_today,
        "skipped_today_count": skipped_today,
        "cancelled_today_count": cancelled_today,
        "avg_waiting_time_minutes": avg_waiting_time
    }


# 2. User Operations
def list_users(db: sqlite3.Connection) -> list:
    cursor = db.cursor()
    cursor.execute("SELECT id, name, email, role, created_at FROM users ORDER BY name ASC;")
    return [dict(row) for row in cursor.fetchall()]

def create_user(db: sqlite3.Connection, name: str, email: str, password: str, role: str) -> dict:
    if role not in ("STUDENT", "STAFF", "ADMIN"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user role")
        
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?;", (email,))
    if cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with this email already exists")
        
    new_id = generate_id("usr")
    password_hash = hash_password(password)
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
    
    cursor.execute("""
        INSERT INTO users (id, name, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
    """, (new_id, name, email, password_hash, role, now))
    db.commit()
    
    return {
        "id": new_id,
        "name": name,
        "email": email,
        "role": role,
        "created_at": now
    }

def update_user(db: sqlite3.Connection, user_id: str, name: str = None, email: str = None, password: str = None, role: str = None) -> dict:
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?;", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user = dict(user)
    
    if email and email != user["email"]:
        cursor.execute("SELECT id FROM users WHERE email = ?;", (email,))
        if cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with this email already exists")
            
    if role and role not in ("STUDENT", "STAFF", "ADMIN"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user role")
        
    updated_name = name if name is not None else user["name"]
    updated_email = email if email is not None else user["email"]
    updated_role = role if role is not None else user["role"]
    updated_hash = hash_password(password) if password else user["password_hash"]
    
    cursor.execute("""
        UPDATE users 
        SET name = ?, email = ?, password_hash = ?, role = ?
        WHERE id = ?;
    """, (updated_name, updated_email, updated_hash, updated_role, user_id))
    db.commit()
    
    return {
        "id": user_id,
        "name": updated_name,
        "email": updated_email,
        "role": updated_role,
        "created_at": user["created_at"]
    }

def delete_user(db: sqlite3.Connection, user_id: str, current_admin_id: str) -> dict:
    if user_id == current_admin_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own logged-in administrator account")
        
    cursor = db.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?;", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    cursor.execute("DELETE FROM users WHERE id = ?;", (user_id,))
    db.commit()
    return {"success": True, "message": "User deleted successfully"}


# 3. Service Operations
def list_services(db: sqlite3.Connection) -> list:
    cursor = db.cursor()
    cursor.execute("SELECT id, name, code, description, created_at FROM services ORDER BY name ASC;")
    return [dict(row) for row in cursor.fetchall()]

def create_service(db: sqlite3.Connection, name: str, code: str, description: str = "") -> dict:
    clean_code = code.strip().upper()
    cursor = db.cursor()
    cursor.execute("SELECT id FROM services WHERE code = ?;", (clean_code,))
    if cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Service shortcode '{clean_code}' is already taken")
        
    new_id = generate_id("srv")
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
    
    cursor.execute("""
        INSERT INTO services (id, name, code, description, created_at)
        VALUES (?, ?, ?, ?, ?);
    """, (new_id, name, clean_code, description or "", now))
    db.commit()
    
    return {
        "id": new_id,
        "name": name,
        "code": clean_code,
        "description": description or "",
        "created_at": now
    }

def update_service(db: sqlite3.Connection, service_id: str, name: str = None, code: str = None, description: str = None) -> dict:
    cursor = db.cursor()
    cursor.execute("SELECT * FROM services WHERE id = ?;", (service_id,))
    service = cursor.fetchone()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    service = dict(service)
    
    clean_code = code.strip().upper() if code else service["code"]
    if code and clean_code != service["code"]:
        cursor.execute("SELECT id FROM services WHERE code = ?;", (clean_code,))
        if cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Service shortcode '{clean_code}' is already taken")
            
    updated_name = name if name is not None else service["name"]
    updated_desc = description if description is not None else service["description"]
    
    cursor.execute("""
        UPDATE services 
        SET name = ?, code = ?, description = ?
        WHERE id = ?;
    """, (updated_name, clean_code, updated_desc, service_id))
    db.commit()
    
    return {
        "id": service_id,
        "name": updated_name,
        "code": clean_code,
        "description": updated_desc,
        "created_at": service["created_at"]
    }

def delete_service(db: sqlite3.Connection, service_id: str) -> dict:
    cursor = db.cursor()
    cursor.execute("SELECT id FROM services WHERE id = ?;", (service_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
        
    cursor.execute("SELECT COUNT(*) as cnt FROM counters WHERE service_id = ?;", (service_id,))
    linked_counters = cursor.fetchone()["cnt"]
    if linked_counters > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot delete service: There are {linked_counters} counters assigned to it.")
        
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE service_id = ? AND status IN ('WAITING', 'SERVING', 'HELD');", (service_id,))
    linked_tokens = cursor.fetchone()["cnt"]
    if linked_tokens > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot delete service: There are {linked_tokens} active tokens currently in queue.")
        
    cursor.execute("DELETE FROM services WHERE id = ?;", (service_id,))
    db.commit()
    return {"success": True, "message": "Service deleted successfully"}


# 4. Counter Operations
def list_counters(db: sqlite3.Connection) -> list:
    cursor = db.cursor()
    cursor.execute("""
        SELECT c.*, s.name as service_name, s.code as service_code, u.name as assigned_staff_name
        FROM counters c
        LEFT JOIN services s ON c.service_id = s.id
        LEFT JOIN users u ON c.assigned_staff_id = u.id
        ORDER BY c.name ASC;
    """)
    return [dict(row) for row in cursor.fetchall()]

def create_counter(db: sqlite3.Connection, name: str, service_id: str, status_val: str = "CLOSED") -> dict:
    cursor = db.cursor()
    cursor.execute("SELECT id FROM services WHERE id = ?;", (service_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected service does not exist")
        
    new_id = generate_id("cntr")
    clean_status = status_val or "CLOSED"
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
    
    cursor.execute("""
        INSERT INTO counters (id, service_id, name, status, assigned_staff_id, created_at)
        VALUES (?, ?, ?, ?, NULL, ?);
    """, (new_id, service_id, name, clean_status, now))
    db.commit()
    
    return {
        "id": new_id,
        "name": name,
        "service_id": service_id,
        "status": clean_status,
        "assigned_staff_id": None,
        "created_at": now
    }

def update_counter(db: sqlite3.Connection, counter_id: str, name: str = None, service_id: str = None, status_val: str = None) -> dict:
    cursor = db.cursor()
    cursor.execute("SELECT * FROM counters WHERE id = ?;", (counter_id,))
    counter = cursor.fetchone()
    if not counter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")
    counter = dict(counter)
    
    if service_id and service_id != counter["service_id"]:
        cursor.execute("SELECT id FROM services WHERE id = ?;", (service_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected service does not exist")
            
    if status_val and status_val not in ("OPEN", "CLOSED", "BUSY", "MAINTENANCE"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid counter status")
        
    updated_name = name if name is not None else counter["name"]
    updated_service_id = service_id if service_id is not None else counter["service_id"]
    updated_status = status_val if status_val is not None else counter["status"]
    
    cursor.execute("""
        UPDATE counters 
        SET name = ?, service_id = ?, status = ?
        WHERE id = ?;
    """, (updated_name, updated_service_id, updated_status, counter_id))
    db.commit()
    
    return {
        "id": counter_id,
        "name": updated_name,
        "service_id": updated_service_id,
        "status": updated_status,
        "assigned_staff_id": counter["assigned_staff_id"],
        "created_at": counter["created_at"]
    }

def delete_counter(db: sqlite3.Connection, counter_id: str) -> dict:
    cursor = db.cursor()
    cursor.execute("SELECT id FROM counters WHERE id = ?;", (counter_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")
        
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE counter_id = ? AND status = 'SERVING';", (counter_id,))
    active_tokens = cursor.fetchone()["cnt"]
    if active_tokens > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete counter: An active token is currently being processed on it.")
        
    cursor.execute("DELETE FROM counters WHERE id = ?;", (counter_id,))
    db.commit()
    return {"success": True, "message": "Counter deleted successfully"}

def assign_staff(db: sqlite3.Connection, counter_id: str, staff_id: str) -> dict:
    cursor = db.cursor()
    cursor.execute("SELECT * FROM counters WHERE id = ?;", (counter_id,))
    counter = cursor.fetchone()
    if not counter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")
        
    if staff_id is not None:
        cursor.execute("SELECT * FROM users WHERE id = ? AND role = 'STAFF';", (staff_id,))
        staff_user = cursor.fetchone()
        if not staff_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User does not exist or does not possess the STAFF role")
            
        # Re-assignment exclusivity check: clear any existing counter assigned to staff
        cursor.execute("SELECT id FROM counters WHERE assigned_staff_id = ? AND id != ?;", (staff_id, counter_id))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("UPDATE counters SET assigned_staff_id = NULL WHERE id = ?;", (existing["id"],))
            
    cursor.execute("UPDATE counters SET assigned_staff_id = ? WHERE id = ?;", (staff_id if staff_id else None, counter_id))
    db.commit()
    
    return {
        "success": True,
        "message": "Staff operator assigned successfully" if staff_id else "Staff operator unassigned successfully",
        "counter_id": counter_id,
        "assigned_staff_id": staff_id if staff_id else None
    }


# 5. Live Monitor
def get_live_monitor(db: sqlite3.Connection) -> list:
    cursor = db.cursor()
    cursor.execute("""
        SELECT c.id as counter_id, c.name as counter_name, c.status as counter_status,
               s.id as service_id, s.name as service_name, s.code as service_code,
               u.id as staff_id, u.name as staff_name
        FROM counters c
        LEFT JOIN services s ON c.service_id = s.id
        LEFT JOIN users u ON c.assigned_staff_id = u.id
        ORDER BY c.name ASC;
    """)
    live_counters = [dict(row) for row in cursor.fetchall()]
    
    live_data = []
    for c in live_counters:
        cursor.execute("""
            SELECT id, token_number, student_name, started_at
            FROM tokens
            WHERE counter_id = ? AND status = 'SERVING'
            LIMIT 1;
        """, (c["counter_id"],))
        serving_row = cursor.fetchone()
        serving_token = dict(serving_row) if serving_row else None
        
        cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE service_id = ? AND status = 'WAITING';", (c["service_id"],))
        queue_count = cursor.fetchone()["cnt"]
        
        live_data.append({
            "counter_id": c["counter_id"],
            "counter_name": c["counter_name"],
            "counter_status": c["counter_status"],
            "service_id": c["service_id"],
            "service_name": c["service_name"],
            "service_code": c["service_code"],
            "assigned_staff": {"id": c["staff_id"], "name": c["staff_name"]} if c["staff_name"] else None,
            "current_token": serving_token,
            "waiting_count": queue_count
        })
        
    return live_data


# 6. Analytics
def get_analytics(db: sqlite3.Connection) -> dict:
    cursor = db.cursor()
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens;")
    total_created = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE status = 'COMPLETED';")
    completed_count = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE status = 'SKIPPED';")
    skipped_count = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE status = 'CANCELLED';")
    cancelled_count = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE status = 'HELD';")
    held_count = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE status = 'WAITING';")
    waiting_count = cursor.fetchone()["cnt"]
    
    cursor.execute("""
        SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_mins
        FROM tokens
        WHERE status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL;
    """)
    avg_srv_row = cursor.fetchone()
    avg_service_mins = avg_srv_row["avg_mins"] if avg_srv_row and avg_srv_row["avg_mins"] is not None else 0.0
    
    cursor.execute("""
        SELECT AVG((julianday(started_at) - julianday(created_at)) * 24 * 60) as avg_mins
        FROM tokens
        WHERE started_at IS NOT NULL;
    """)
    avg_wait_row = cursor.fetchone()
    avg_waiting_mins = avg_wait_row["avg_mins"] if avg_wait_row and avg_wait_row["avg_mins"] is not None else 0.0
    
    cursor.execute("""
        SELECT s.id, s.name as label, s.code, COUNT(t.id) as value
        FROM services s
        LEFT JOIN tokens t ON s.id = t.service_id
        GROUP BY s.id;
    """)
    service_dist = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("""
        SELECT c.id, c.name as label, COUNT(t.id) as value
        FROM counters c
        LEFT JOIN tokens t ON c.id = t.counter_id AND t.status = 'COMPLETED'
        GROUP BY c.id;
    """)
    counter_act = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("""
        SELECT strftime('%H:00', created_at) as hour, COUNT(*) as count
        FROM tokens
        WHERE created_at IS NOT NULL
        GROUP BY hour
        ORDER BY hour ASC;
    """)
    hourly_dist = [dict(row) for row in cursor.fetchall()]
    
    return {
        "summary": {
            "total_created": total_created,
            "completed_count": completed_count,
            "skipped_count": skipped_count,
            "cancelled_count": cancelled_count,
            "held_count": held_count,
            "waiting_count": waiting_count,
            "avg_service_minutes": round(avg_service_mins, 1),
            "avg_waiting_minutes": round(avg_waiting_mins, 1)
        },
        "service_distribution": service_dist,
        "counter_activity": counter_act,
        "hourly_distribution": hourly_dist
    }
