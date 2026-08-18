import sqlite3
from datetime import datetime, timezone
from fastapi import HTTPException, status

def parse_timestamp(ts_str: str) -> datetime:
    """
    Parses SQLite datetime strings safely into a UTC datetime object.
    """
    if not ts_str:
        return datetime.now(timezone.utc)
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.strptime(ts_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc)


def get_historical_service_duration(db: sqlite3.Connection, service_id: str, counter_id: str = None) -> float:
    """
    Retrieves the historical average service duration in minutes.
    Hierarchy:
      1. Same counter + same service (if >= 2 valid completed tokens exist)
      2. Same service across counters (if >= 2 valid completed tokens exist)
      3. Global safe cold-start fallback (5.0 minutes)
    Sanity clamping: Result is clamped between 1.0 and 60.0 minutes to prevent corrupted outlier records from skewing estimates.
    """
    cursor = db.cursor()
    
    # 1. Attempt counter-specific historical duration query
    if counter_id:
        cursor.execute("""
            SELECT started_at, completed_at
            FROM tokens
            WHERE service_id = ? AND counter_id = ? AND status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL
            ORDER BY completed_at DESC
            LIMIT 10;
        """, (service_id, counter_id))
        rows = cursor.fetchall()
        valid_durations = []
        for r in rows:
            st_dt = parse_timestamp(r["started_at"])
            end_dt = parse_timestamp(r["completed_at"])
            duration_mins = (end_dt - st_dt).total_seconds() / 60.0
            # Ignore corrupted/absurd records (<= 0 or > 4 hours)
            if 0 < duration_mins <= 240:
                valid_durations.append(duration_mins)
        
        if len(valid_durations) >= 2:
            avg_mins = sum(valid_durations) / len(valid_durations)
            return max(1.0, min(60.0, avg_mins))

    # 2. Service-level historical duration fallback
    cursor.execute("""
        SELECT started_at, completed_at
        FROM tokens
        WHERE service_id = ? AND status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT 10;
    """, (service_id,))
    rows = cursor.fetchall()
    valid_durations = []
    for r in rows:
        st_dt = parse_timestamp(r["started_at"])
        end_dt = parse_timestamp(r["completed_at"])
        duration_mins = (end_dt - st_dt).total_seconds() / 60.0
        if 0 < duration_mins <= 240:
            valid_durations.append(duration_mins)
            
    if len(valid_durations) >= 2:
        avg_mins = sum(valid_durations) / len(valid_durations)
        return max(1.0, min(60.0, avg_mins))

    # 3. Cold-start fallback
    return 5.0


def calculate_dynamic_wait_time(db: sqlite3.Connection, service_id: str, people_ahead: int, counter_id: str = None) -> int:
    """
    Calculates dynamic wait time in minutes based on counter/service historical service duration,
    service capacity, and cold-start fallback.
    """
    if people_ahead <= 0:
        return 0

    cursor = db.cursor()
    avg_service_mins = get_historical_service_duration(db, service_id, counter_id)

    if counter_id:
        active_counters = 1
    else:
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM counters
            WHERE service_id = ? AND status IN ('OPEN', 'BUSY');
        """, (service_id,))
        active_counters = cursor.fetchone()["cnt"]
        if active_counters <= 0:
            active_counters = 1

    estimated = round((people_ahead * avg_service_mins) / active_counters)
    return max(1, int(estimated))


def select_best_counter_for_service(db: sqlite3.Connection, service_id: str) -> str:
    """
    Selects the operational counter (OPEN or BUSY) with the lowest Effective Wait Score for a service.
    Effective Wait Score = (serving_tokens + waiting_tokens) * counter_avg_service_mins.
    Tie-breaking:
      1. Lower effective wait score
      2. Lower total token count (serving + waiting)
      3. Counter name ASC
      4. Counter ID ASC
    """
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, name, status FROM counters
        WHERE service_id = ? AND status IN ('OPEN', 'BUSY')
        ORDER BY name ASC, id ASC;
    """, (service_id,))
    counters = cursor.fetchall()
    
    if not counters:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active counters are currently accepting tokens for this service"
        )
        
    best_counter_id = None
    min_effective_wait = float('inf')
    min_load = float('inf')
    
    for c in counters:
        cid = c["id"]
        cname = c["name"]
        
        cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE counter_id = ? AND status = 'SERVING';", (cid,))
        serving_cnt = cursor.fetchone()["cnt"]
        
        cursor.execute("SELECT COUNT(*) as cnt FROM tokens WHERE counter_id = ? AND status = 'WAITING';", (cid,))
        waiting_cnt = cursor.fetchone()["cnt"]
        
        total_load = serving_cnt + waiting_cnt
        avg_duration = get_historical_service_duration(db, service_id, counter_id=cid)
        effective_wait = total_load * avg_duration
        
        # Tie-breaker logic: lowest effective wait -> lowest total load -> counter name/id ASC
        if effective_wait < min_effective_wait - 1e-5:
            min_effective_wait = effective_wait
            min_load = total_load
            best_counter_id = cid
        elif abs(effective_wait - min_effective_wait) <= 1e-5:
            if total_load < min_load:
                min_effective_wait = effective_wait
                min_load = total_load
                best_counter_id = cid

    return best_counter_id or counters[0]["id"]


def get_waiting_queue(db: sqlite3.Connection, service_id: str, counter_id: str = None) -> list[dict]:
    """
    Retrieves all WAITING tokens for a service (optionally filtered by counter_id for counter affinity),
    ordered by Priority Aging + FCFS rule.
    Effective Priority = Base Score + floor(elapsed_minutes / 5)
    Base Scores: URGENT = 3, HIGH/PRIORITY = 2, NORMAL = 1
    Tie-breaking: Effective Priority DESC, created_at ASC, id ASC
    """
    cursor = db.cursor()
    if counter_id:
        cursor.execute("""
            SELECT * FROM tokens
            WHERE service_id = ? AND counter_id = ? AND status = 'WAITING';
        """, (service_id, counter_id))
    else:
        cursor.execute("""
            SELECT * FROM tokens
            WHERE service_id = ? AND status = 'WAITING';
        """, (service_id,))
        
    tokens = [dict(row) for row in cursor.fetchall()]
    now = datetime.now(timezone.utc)
    
    def get_base_score(priority: str) -> int:
        p = (priority or "NORMAL").upper()
        if p == "URGENT":
            return 3
        elif p in ("HIGH", "PRIORITY"):
            return 2
        return 1

    scored_tokens = []
    for t in tokens:
        created_dt = parse_timestamp(t["created_at"])
        elapsed_seconds = max(0.0, (now - created_dt).total_seconds())
        elapsed_minutes = elapsed_seconds / 60.0
        
        aging_bonus = int(elapsed_minutes // 5)
        base_score = get_base_score(t.get("priority", "NORMAL"))
        effective_priority = base_score + aging_bonus
        
        scored_tokens.append((effective_priority, t["created_at"], t["id"], t))

    scored_tokens.sort(key=lambda x: (-x[0], x[1], x[2]))
    return [item[3] for item in scored_tokens]


def get_token_position_details(db: sqlite3.Connection, token_id: str) -> dict | None:
    """
    Computes a token's real-time queue position and dynamic wait estimates with counter affinity.
    Returns: {"position": int, "people_ahead": int, "estimated_wait_time": int}
    """
    cursor = db.cursor()
    cursor.execute("SELECT * FROM tokens WHERE id = ?;", (token_id,))
    row = cursor.fetchone()
    if not row:
        return None
        
    token = dict(row)
    if token["status"] == "SERVING":
        return {"position": 0, "people_ahead": 0, "estimated_wait_time": 0}
        
    if token["status"] != "WAITING":
        return {"position": -1, "people_ahead": 0, "estimated_wait_time": 0}
        
    sorted_queue = get_waiting_queue(db, token["service_id"], counter_id=token.get("counter_id"))
    idx = -1
    for i, t in enumerate(sorted_queue):
        if t["id"] == token_id:
            idx = i
            break
            
    if idx == -1:
        return None
        
    people_ahead = idx
    position = idx + 1
    wait_time = calculate_dynamic_wait_time(db, token["service_id"], people_ahead, counter_id=token.get("counter_id"))
    return {
        "position": position,
        "people_ahead": people_ahead,
        "estimated_wait_time": wait_time
    }


def call_next_token(db: sqlite3.Connection, counter_id: str, service_id: str) -> dict:
    """
    Enforces active serving checks, picks the next waiting token assigned to counter_id (Counter Affinity),
    and assigns it to counter_id.
    Runs inside a strict SQLite BEGIN IMMEDIATE transaction lock.
    """
    cursor = db.cursor()
    try:
        db.execute("BEGIN IMMEDIATE;")
        
        # 1. Verify counter status is OPEN
        cursor.execute("SELECT status FROM counters WHERE id = ?;", (counter_id,))
        counter = cursor.fetchone()
        if not counter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")
        counter_status = counter["status"] if isinstance(counter, sqlite3.Row) else counter[0]
        if counter_status != "OPEN":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot call next token: Counter is currently {counter_status}"
            )
            
        # 2. Assert no token is currently SERVING at this counter (Queue Invariant Check)
        cursor.execute("SELECT * FROM tokens WHERE counter_id = ? AND status = 'SERVING';", (counter_id,))
        active_serving = cursor.fetchone()
        if active_serving:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Counter already has active serving token {active_serving['token_number']}. Complete, hold, or skip it first."
            )
            
        # 3. Pull next eligible token assigned to this counter (Counter Affinity)
        waiting = get_waiting_queue(db, service_id, counter_id=counter_id)
        if not waiting:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Waiting queue is currently empty for this counter."
            )
        next_token = waiting[0]
        
        # 4. Mutate to SERVING
        now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        cursor.execute("""
            UPDATE tokens
            SET status = 'SERVING', counter_id = ?, started_at = ?
            WHERE id = ? AND status = 'WAITING';
        """, (counter_id, now, next_token["id"]))
        
        db.commit()
        
        # Get updated token
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.id = ?;
        """, (next_token["id"],))
        return dict(cursor.fetchone())
        
    except HTTPException:
        db.rollback()
        raise
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error: {str(e)}"
        )


def complete_token(db: sqlite3.Connection, token_id: str, counter_id: str) -> dict:
    """
    Marks a serving token as COMPLETED.
    """
    cursor = db.cursor()
    try:
        db.execute("BEGIN IMMEDIATE;")
        cursor.execute("SELECT * FROM tokens WHERE id = ?;", (token_id,))
        token_row = cursor.fetchone()
        if not token_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        token = dict(token_row)
        
        if token["status"] != "SERVING":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state transition: Cannot complete token with status '{token['status']}'. Must be 'SERVING'."
            )
            
        if token["counter_id"] != counter_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unauthorized: Token is assigned to a different counter"
            )
            
        now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        cursor.execute("""
            UPDATE tokens
            SET status = 'COMPLETED', completed_at = ?
            WHERE id = ? AND status = 'SERVING';
        """, (now, token_id))
        db.commit()
        
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.id = ?;
        """, (token_id,))
        return dict(cursor.fetchone())
        
    except HTTPException:
        db.rollback()
        raise
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error: {str(e)}"
        )


def hold_token(db: sqlite3.Connection, token_id: str, counter_id: str) -> dict:
    """
    Places a serving token on HELD.
    """
    cursor = db.cursor()
    try:
        db.execute("BEGIN IMMEDIATE;")
        cursor.execute("SELECT * FROM tokens WHERE id = ?;", (token_id,))
        token_row = cursor.fetchone()
        if not token_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        token = dict(token_row)
        
        if token["status"] != "SERVING":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state transition: Cannot hold token with status '{token['status']}'. Must be 'SERVING'."
            )
            
        if token["counter_id"] != counter_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unauthorized: Token is assigned to a different counter"
            )
            
        now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        cursor.execute("""
            UPDATE tokens
            SET status = 'HELD', held_at = ?
            WHERE id = ? AND status = 'SERVING';
        """, (now, token_id))
        db.commit()
        
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.id = ?;
        """, (token_id,))
        return dict(cursor.fetchone())
        
    except HTTPException:
        db.rollback()
        raise
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error: {str(e)}"
        )


def resume_token(db: sqlite3.Connection, token_id: str, counter_id: str) -> dict:
    """
    Resumes a held token back to SERVING.
    """
    cursor = db.cursor()
    try:
        db.execute("BEGIN IMMEDIATE;")
        cursor.execute("SELECT * FROM tokens WHERE id = ?;", (token_id,))
        token_row = cursor.fetchone()
        if not token_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        token = dict(token_row)
        
        if token["status"] != "HELD":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state transition: Cannot resume token with status '{token['status']}'. Must be 'HELD'."
            )
            
        # Assert no token is currently SERVING at this counter (Queue Invariant Check)
        cursor.execute("SELECT * FROM tokens WHERE counter_id = ? AND status = 'SERVING';", (counter_id,))
        active_serving = cursor.fetchone()
        if active_serving:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot resume token: Counter already has active serving token {active_serving['token_number']}."
            )
            
        now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        cursor.execute("""
            UPDATE tokens
            SET status = 'SERVING', counter_id = ?, started_at = ?
            WHERE id = ? AND status = 'HELD';
        """, (counter_id, now, token_id))
        db.commit()
        
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.id = ?;
        """, (token_id,))
        return dict(cursor.fetchone())
        
    except HTTPException:
        db.rollback()
        raise
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error: {str(e)}"
        )


def skip_token(db: sqlite3.Connection, token_id: str, counter_id: str) -> dict:
    """
    Skips a waiting, serving, or held token to state SKIPPED.
    """
    cursor = db.cursor()
    try:
        db.execute("BEGIN IMMEDIATE;")
        cursor.execute("SELECT * FROM tokens WHERE id = ?;", (token_id,))
        token_row = cursor.fetchone()
        if not token_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        token = dict(token_row)
        
        if token["status"] not in ("WAITING", "SERVING", "HELD"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state transition: Cannot skip token with status '{token['status']}'."
            )
            
        now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        cursor.execute("""
            UPDATE tokens
            SET status = 'SKIPPED', skipped_at = ?
            WHERE id = ?;
        """, (now, token_id))
        db.commit()
        
        cursor.execute("""
            SELECT t.*, s.name as service_name, c.name as counter_name
            FROM tokens t
            JOIN services s ON t.service_id = s.id
            JOIN counters c ON t.counter_id = c.id
            WHERE t.id = ?;
        """, (token_id,))
        return dict(cursor.fetchone())
        
    except HTTPException:
        db.rollback()
        raise
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error: {str(e)}"
        )
