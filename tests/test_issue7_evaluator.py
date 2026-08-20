import os
import sqlite3
import jwt
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

# Force settings for the test environment
settings.mock_auth = True
settings.db_path = "test_queuecraft_eval7.db"

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_eval_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    settings.db_path = "test_queuecraft_eval7.db"
    from app.database import initialize_schema, seed_database
    if os.path.exists("test_queuecraft_eval7.db"):
        try:
            os.remove("test_queuecraft_eval7.db")
        except Exception:
            pass
    initialize_schema()
    seed_database()
    yield
    settings.db_path = "test_queuecraft.db"
    if os.path.exists("test_queuecraft_eval7.db"):
        try:
            os.remove("test_queuecraft_eval7.db")
        except Exception:
            pass

def clean_all_tokens():
    """Helper to clear all tokens for isolated tests."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tokens;")
    conn.commit()
    conn.close()

def generate_student_jwt(user_id: str) -> str:
    """Helper to generate signed student JWT token."""
    payload = {
        "id": user_id,
        "name": f"Student {user_id}",
        "email": f"{user_id}@queuecraft.edu"
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

def set_counter_status(counter_id: str, status: str):
    """Helper to set counter status in SQLite."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("UPDATE counters SET status = ? WHERE id = ?;", (status, counter_id))
    conn.commit()
    conn.close()

def insert_waiting_token(token_id: str, token_number: str, student_id: str):
    """Helper to insert token into database."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (
            id, token_number, student_id, student_name, student_email, service_id, counter_id,
            priority, status, created_at
        ) VALUES (?, ?, ?, 'Test Student', 'test@queuecraft.edu', 'srv-lp', 'cntr-lp-2', 'NORMAL', 'WAITING', CURRENT_TIMESTAMP);
    """, (token_id, token_number, student_id))
    conn.commit()
    conn.close()


# ==============================================================================
# ISSUE #7: QUEUE OPERATIONS RESPECT COUNTER AVAILABILITY
# ==============================================================================

def test_m7a_unavailable_counter_rejects_operations():
    """
    M7-A: Server-Side Counter Availability Enforcement.

    Verifies:
    1. A CLOSED counter strictly rejects new token bookings (400 Bad Request).
    2. A CLOSED counter strictly rejects CALL NEXT operations (400 Bad Request),
       even when tokens are waiting in line.
    3. A MAINTENANCE counter strictly rejects bookings and NEXT operations.
    4. A BUSY counter (with an active serving token) strictly rejects calling NEXT
       until the current token is completed, skipped, or held.
    5. Rejections are enforced server-side regardless of client behavior.
    """
    clean_all_tokens()

    # -------------------------------------------------------------
    # 1. Test CLOSED Counter
    # -------------------------------------------------------------
    set_counter_status("cntr-lp-2", "CLOSED")
    insert_waiting_token("tkn-wait-closed", "LP-991", "usr-student-closed-wait")

    student_jwt = generate_student_jwt("usr-student-closed-test")
    book_closed_res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {student_jwt}"}
    )
    assert book_closed_res.status_code == 400, f"Booking on CLOSED counter should return 400, got {book_closed_res.status_code}"

    next_closed_res = client.post(
        "/api/staff/counter/next",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert next_closed_res.status_code == 400, f"Calling NEXT on CLOSED counter should return 400, got {next_closed_res.status_code}"

    # -------------------------------------------------------------
    # 2. Test MAINTENANCE Counter
    # -------------------------------------------------------------
    set_counter_status("cntr-lp-2", "MAINTENANCE")
    insert_waiting_token("tkn-wait-maint", "LP-992", "usr-student-maint-wait")

    book_maint_res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {student_jwt}"}
    )
    assert book_maint_res.status_code == 400, f"Booking on MAINTENANCE counter should return 400, got {book_maint_res.status_code}"

    next_maint_res = client.post(
        "/api/staff/counter/next",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert next_maint_res.status_code == 400, f"Calling NEXT on MAINTENANCE counter should return 400, got {next_maint_res.status_code}"

    # -------------------------------------------------------------
    # 3. Test Active SERVING / BUSY Counter Safeguards
    # -------------------------------------------------------------
    set_counter_status("cntr-lp-2", "OPEN")

    # Book two tokens
    s1_jwt = generate_student_jwt("usr-student-s1")
    s2_jwt = generate_student_jwt("usr-student-s2")
    client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"}, headers={"Authorization": f"Bearer {s1_jwt}"})
    client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"}, headers={"Authorization": f"Bearer {s2_jwt}"})

    # Call NEXT: first token becomes SERVING
    call_1 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert call_1.status_code == 200
    token_1 = call_1.json()["token"]
    assert token_1["status"] == "SERVING"

    # Attempt to call NEXT again while counter already has active serving token
    call_again = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert call_again.status_code == 400, f"Calling NEXT when token is already SERVING should return 400, got {call_again.status_code}"


def test_m7b_counter_availability_state_transition():
    """
    M7-B: Counter Availability State Transitions (OPEN -> MAINTENANCE -> OPEN).

    Verifies:
    1. Normal operations function when counter is OPEN.
    2. Changing counter status to MAINTENANCE blocks new operations.
    3. Existing waiting queue tokens are NOT lost or corrupted during maintenance.
    4. When status transitions back to OPEN, queue processing resumes smoothly
       and previously waiting tokens are served in correct sequence.
    """
    clean_all_tokens()
    set_counter_status("cntr-lp-2", "OPEN")

    # 1. Book 3 tokens under OPEN state: T1, T2, T3
    u1_jwt = generate_student_jwt("usr-student-trans-1")
    u2_jwt = generate_student_jwt("usr-student-trans-2")
    u3_jwt = generate_student_jwt("usr-student-trans-3")

    r1 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"}, headers={"Authorization": f"Bearer {u1_jwt}"})
    r2 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"}, headers={"Authorization": f"Bearer {u2_jwt}"})
    r3 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"}, headers={"Authorization": f"Bearer {u3_jwt}"})

    assert r1.status_code == 200 and r2.status_code == 200 and r3.status_code == 200
    t1_id = r1.json()["token"]["id"]
    t2_id = r2.json()["token"]["id"]
    t3_id = r3.json()["token"]["id"]

    # Call NEXT: T1 is SERVING
    call_1 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert call_1.status_code == 200
    assert call_1.json()["token"]["id"] == t1_id

    # 2. Transition counter to MAINTENANCE
    patch_res = client.patch(
        "/api/staff/counter/status",
        json={"status": "MAINTENANCE"},
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert patch_res.status_code == 200

    # Operations blocked during MAINTENANCE
    u4_jwt = generate_student_jwt("usr-student-trans-4")
    book_blocked = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {u4_jwt}"}
    )
    assert book_blocked.status_code == 400

    next_blocked = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert next_blocked.status_code == 400

    # Inspect DB: T2 and T3 must still be in WAITING state (no data loss)
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, status FROM tokens WHERE service_id = 'srv-lp' AND status = 'WAITING' ORDER BY created_at ASC;")
    preserved_tokens = cursor.fetchall()
    conn.close()

    assert len(preserved_tokens) == 2
    assert [t[0] for t in preserved_tokens] == [t2_id, t3_id]

    # Complete T1 (which was serving prior to maintenance)
    comp_1 = client.post(f"/api/staff/tokens/{t1_id}/complete", headers={"Authorization": "Bearer mock-token-staff"})
    assert comp_1.status_code == 200

    # 3. Transition counter back to OPEN
    reopen_res = client.patch(
        "/api/staff/counter/status",
        json={"status": "OPEN"},
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert reopen_res.status_code == 200

    # New bookings now work
    book_res_4 = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {u4_jwt}"}
    )
    assert book_res_4.status_code == 200
    t4_id = book_res_4.json()["token"]["id"]

    # Calling NEXT now cleanly serves T2 (next in line)
    call_2 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert call_2.status_code == 200
    assert call_2.json()["token"]["id"] == t2_id

    # Complete T2 and call NEXT -> serves T3
    client.post(f"/api/staff/tokens/{t2_id}/complete", headers={"Authorization": "Bearer mock-token-staff"})
    call_3 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert call_3.status_code == 200
    assert call_3.json()["token"]["id"] == t3_id

    # Complete T3 and call NEXT -> serves T4
    client.post(f"/api/staff/tokens/{t3_id}/complete", headers={"Authorization": "Bearer mock-token-staff"})
    call_4 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert call_4.status_code == 200
    assert call_4.json()["token"]["id"] == t4_id
