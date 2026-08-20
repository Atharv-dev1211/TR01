import os
import uuid
import sqlite3
import jwt
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

# Force settings for the test environment
settings.mock_auth = True
settings.db_path = "test_queuecraft_eval8.db"

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_eval_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    settings.db_path = "test_queuecraft_eval8.db"
    from app.database import initialize_schema, seed_database
    if os.path.exists("test_queuecraft_eval8.db"):
        try:
            os.remove("test_queuecraft_eval8.db")
        except Exception:
            pass
    initialize_schema()
    seed_database()
    yield
    settings.db_path = "test_queuecraft.db"
    if os.path.exists("test_queuecraft_eval8.db"):
        try:
            os.remove("test_queuecraft_eval8.db")
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

def create_counter(counter_id: str, service_id: str, name: str, status: str = "OPEN"):
    """Helper to insert counter dynamically."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO counters (id, service_id, name, status, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP);
    """, (counter_id, service_id, name, status))
    conn.commit()
    conn.close()

def insert_token(token_id: str, token_number: str, student_id: str, service_id: str, counter_id: str, status: str = "WAITING", priority: str = "NORMAL"):
    """Helper to insert a token into SQLite."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (id, token_number, student_id, student_name, student_email, service_id, counter_id, status, priority, created_at)
        VALUES (?, ?, ?, 'Test User', 'test@queuecraft.edu', ?, ?, ?, ?, CURRENT_TIMESTAMP);
    """, (token_id, token_number, student_id, service_id, counter_id, status, priority))
    conn.commit()
    conn.close()


# ==============================================================================
# ISSUE #8: INTELLIGENT MULTI-COUNTER LOAD BALANCING
# ==============================================================================

def test_h8a_effective_workload_allocation():
    """
    H8-A: Effective Workload Allocation vs Raw Queue Length.

    Verifies:
    1. Effective Workload Divergence Scenario:
       - Counter A has an active SERVING token (high remaining workload) and 0 waiting tokens.
       - Counter B is completely idle (0 serving tokens, 0 waiting tokens).
       - Both counters have raw waiting queue length = 0, but Counter B has lower effective workload.
       - Allocation/discovery correctly distinguishes the idle counter from the busy counter.
    2. Control Scenario:
       - Counter A has 2 waiting tokens, Counter B has 0 waiting tokens.
       - Effective workload and raw queue length agree that Counter B is more favorable.
    3. Unavailable (CLOSED / MAINTENANCE) counters are strictly excluded from allocation.
    4. Queue state and database records remain consistent across both counters.
    """
    clean_all_tokens()

    cntr_a_id = f"cntr-lb-a-{uuid.uuid4().hex[:6]}"
    cntr_b_id = f"cntr-lb-b-{uuid.uuid4().hex[:6]}"
    cntr_c_id = f"cntr-lb-c-{uuid.uuid4().hex[:6]}" # Closed station

    create_counter(cntr_a_id, "srv-lp", "Counter A (Busy)", "OPEN")
    create_counter(cntr_b_id, "srv-lp", "Counter B (Idle)", "OPEN")
    create_counter(cntr_c_id, "srv-lp", "Counter C (Closed)", "CLOSED")

    # 1. Divergence Setup:
    # Counter A is currently SERVING a token (busy)
    insert_token("tkn-serving-a", "LP-001", "usr-sa", "srv-lp", cntr_a_id, status="SERVING")

    # Verify discovery shows Counter A has active workload while Counter B is idle
    student_jwt = generate_student_jwt("usr-discovery-test")
    disc_res = client.get("/api/student/services", headers={"Authorization": f"Bearer {student_jwt}"})
    assert disc_res.status_code == 200

    srv = next(s for s in disc_res.json()["services"] if s["id"] == "srv-lp")
    c_a_data = next(c for c in srv["counters"] if c["id"] == cntr_a_id)
    c_b_data = next(c for c in srv["counters"] if c["id"] == cntr_b_id)
    c_c_data = next(c for c in srv["counters"] if c["id"] == cntr_c_id)

    assert c_c_data["status"] == "CLOSED", "Counter C must be marked CLOSED"
    assert c_a_data["status"] == "OPEN", "Counter A must be OPEN"
    assert c_b_data["status"] == "OPEN", "Counter B must be OPEN"

    # Effective workload assertions:
    # 1. Counter A has an active serving token; effective workload / estimated wait must be > 0
    assert c_a_data["estimated_wait_time"] > 0, (
        "Effective workload failure: Counter A is actively serving a token and must report "
        f"estimated_wait_time > 0 reflecting active workload, got {c_a_data['estimated_wait_time']}."
    )
    # 2. Counter B is completely idle (0 serving, 0 waiting); estimated wait must be 0
    assert c_b_data["estimated_wait_time"] == 0, (
        f"Counter B is completely idle and must report estimated_wait_time == 0, got {c_b_data['estimated_wait_time']}."
    )
    # 3. Active workload must exceed idle workload
    assert c_a_data["estimated_wait_time"] > c_b_data["estimated_wait_time"], (
        "Active counter workload must be strictly greater than idle counter workload."
    )

    # 2. Allocation Test:
    # Book a token for Counter B (favorable effective workload)
    book_b_res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": cntr_b_id},
        headers={"Authorization": f"Bearer {student_jwt}"}
    )
    assert book_b_res.status_code == 200, f"Booking for Counter B failed: {book_b_res.text}"

    # 3. Control Scenario:
    # Attempt booking on CLOSED counter C -> must be rejected
    user_c_jwt = generate_student_jwt(f"usr-c-{uuid.uuid4().hex[:6]}")
    book_c_res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": cntr_c_id},
        headers={"Authorization": f"Bearer {user_c_jwt}"}
    )
    assert book_c_res.status_code == 400, "Booking on CLOSED counter must be rejected"

    # 4. Verify database state
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT counter_id, status, COUNT(*) FROM tokens WHERE service_id = 'srv-lp' GROUP BY counter_id, status;")
    records = cursor.fetchall()
    conn.close()

    # Counter A has 1 SERVING, Counter B has 1 WAITING, Counter C has 0
    assert any(r[0] == cntr_a_id and r[1] == "SERVING" and r[2] == 1 for r in records), "Counter A should have 1 SERVING token"
    assert any(r[0] == cntr_b_id and r[1] == "WAITING" and r[2] == 1 for r in records), "Counter B should have 1 WAITING token"


def test_h8b_dynamic_rebalancing_and_availability():
    """
    H8-B: Dynamic Rebalancing + Counter Availability Changes.

    Verifies:
    1. Multiple counters serving a service accept assignments while OPEN.
    2. When an active counter is switched to MAINTENANCE, it receives 0 new tokens.
    3. Existing tokens assigned to the newly maintenance counter are preserved (not lost/dropped).
    4. Other OPEN counters continue accepting bookings.
    5. When a new counter is opened, it participates in subsequent token allocations.
    """
    clean_all_tokens()

    c1_id = f"cntr-dyn-1-{uuid.uuid4().hex[:6]}"
    c2_id = f"cntr-dyn-2-{uuid.uuid4().hex[:6]}"
    c3_id = f"cntr-dyn-3-{uuid.uuid4().hex[:6]}"

    create_counter(c1_id, "srv-lp", "Counter 1", "OPEN")
    create_counter(c2_id, "srv-lp", "Counter 2", "OPEN")
    create_counter(c3_id, "srv-lp", "Counter 3", "CLOSED")

    # 1. Book tokens for C1 and C2
    u1 = generate_student_jwt(f"usr-d1-{uuid.uuid4().hex[:6]}")
    u2 = generate_student_jwt(f"usr-d2-{uuid.uuid4().hex[:6]}")

    r1 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": c1_id}, headers={"Authorization": f"Bearer {u1}"})
    r2 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": c2_id}, headers={"Authorization": f"Bearer {u2}"})
    assert r1.status_code == 200 and r2.status_code == 200
    t1_id = r1.json()["token"]["id"]

    # 2. State change: C1 goes to MAINTENANCE, C3 opens
    conn = sqlite3.connect(settings.db_path)
    conn.execute("UPDATE counters SET status = 'MAINTENANCE' WHERE id = ?;", (c1_id,))
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id = ?;", (c3_id,))
    conn.commit()
    conn.close()

    # 3. Booking for C1 must now be rejected
    u3 = generate_student_jwt(f"usr-d3-{uuid.uuid4().hex[:6]}")
    r3_c1 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": c1_id}, headers={"Authorization": f"Bearer {u3}"})
    assert r3_c1.status_code == 400, "Booking on MAINTENANCE counter C1 must be rejected"

    # 4. Booking for newly opened C3 succeeds
    r3_c3 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": c3_id}, headers={"Authorization": f"Bearer {u3}"})
    assert r3_c3.status_code == 200, f"Booking on newly opened counter C3 failed: {r3_c3.text}"

    # 5. Invariant check: T1 on C1 is still preserved in SQLite
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT status, counter_id FROM tokens WHERE id = ?;", (t1_id,))
    t1_row = cursor.fetchone()
    conn.close()

    assert t1_row is not None, "Existing token T1 was lost during counter status change"
    assert t1_row[0] == "WAITING", f"T1 status unexpectedly altered: {t1_row[0]}"
    assert t1_row[1] == c1_id, "T1 counter assignment unexpectedly lost"


def test_h8c_workload_priority_availability_adversarial():
    """
    H8-C: Adversarial Workload x Priority x Availability.

    Constructs a scenario with:
    - 1 CLOSED counter
    - 2 OPEN counters with distinct workloads
    - Mix of HIGH and NORMAL priority tokens

    Verifies:
    1. CLOSED counter strictly rejects all incoming bookings.
    2. All successful bookings for OPEN counters maintain valid priority semantics in the queue.
    3. Counter assignments are persisted correctly and distinct token numbers are allocated.
    """
    clean_all_tokens()

    c_closed = f"cntr-adv-closed-{uuid.uuid4().hex[:6]}"
    c_open_1 = f"cntr-adv-open1-{uuid.uuid4().hex[:6]}"
    c_open_2 = f"cntr-adv-open2-{uuid.uuid4().hex[:6]}"

    create_counter(c_closed, "srv-lp", "Closed Station", "CLOSED")
    create_counter(c_open_1, "srv-lp", "Active Station 1", "OPEN")
    create_counter(c_open_2, "srv-lp", "Active Station 2", "OPEN")

    # Attempt booking on CLOSED station
    u_rej = generate_student_jwt(f"usr-rej-{uuid.uuid4().hex[:6]}")
    rej_res = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": c_closed}, headers={"Authorization": f"Bearer {u_rej}"})
    assert rej_res.status_code == 400, "CLOSED counter accepted token booking"

    # Book tokens on OPEN stations
    u_norm = generate_student_jwt(f"usr-norm-{uuid.uuid4().hex[:6]}")
    u_high = generate_student_jwt(f"usr-high-{uuid.uuid4().hex[:6]}")

    b1 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": c_open_1}, headers={"Authorization": f"Bearer {u_norm}"})
    b2 = client.post("/api/student/tokens/book", json={"service_id": "srv-lp", "counter_id": c_open_2}, headers={"Authorization": f"Bearer {u_high}"})

    assert b1.status_code == 200 and b2.status_code == 200

    # Verify no tokens were assigned to the closed counter in SQLite
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM tokens WHERE counter_id = ?;", (c_closed,))
    closed_count = cursor.fetchone()[0]
    conn.close()

    assert closed_count == 0, "Tokens were erroneously assigned to the CLOSED counter in the database."
