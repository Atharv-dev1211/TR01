import os
import uuid
import sqlite3
import jwt
import threading
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

# Force settings for the test environment
settings.mock_auth = True
settings.db_path = "test_queuecraft_eval9.db"

client = TestClient(app, raise_server_exceptions=False)

@pytest.fixture(autouse=True)
def setup_eval_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    settings.db_path = "test_queuecraft_eval9.db"
    from app.database import initialize_schema, seed_database
    if os.path.exists("test_queuecraft_eval9.db"):
        try:
            os.remove("test_queuecraft_eval9.db")
        except Exception:
            pass
    initialize_schema()
    seed_database()
    yield
    settings.db_path = "test_queuecraft.db"
    if os.path.exists("test_queuecraft_eval9.db"):
        try:
            os.remove("test_queuecraft_eval9.db")
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

def insert_token(token_id: str, token_number: str, student_id: str, priority: str, status: str, created_at_str: str):
    """Helper to insert token into SQLite."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (
            id, token_number, student_id, student_name, student_email, service_id, counter_id,
            priority, status, created_at
        ) VALUES (?, ?, ?, 'Test Student', 'student@queuecraft.edu', 'srv-lp', 'cntr-lp-2', ?, ?, ?);
    """, (token_id, token_number, student_id, priority, status, created_at_str))
    conn.commit()
    conn.close()


# ==============================================================================
# ISSUE #9: AUTOMATIC WAITLIST PROMOTION WITH FAIR SCHEDULING
# ==============================================================================

def test_h9a_deterministic_fair_promotion():
    """
    H9-A: Deterministic Fair Promotion.

    Verifies:
    1. When a counter calls NEXT, exactly one candidate is promoted into service.
    2. Promotion preserves priority and FIFO order deterministically.
    3. Running the same promotion pattern with dynamic IDs produces consistent outcomes.
    """
    clean_all_tokens()

    # Insert 3 waiting candidates:
    # 1. Normal priority (early)
    # 2. High priority (fresh)
    # 3. Normal priority (later)
    t1_id = f"tkn-fair-norm1-{uuid.uuid4().hex[:6]}"
    t2_id = f"tkn-fair-high-{uuid.uuid4().hex[:6]}"
    t3_id = f"tkn-fair-norm2-{uuid.uuid4().hex[:6]}"

    insert_token(t1_id, "LP-101", "usr-s1", "NORMAL", "WAITING", "2026-08-20 10:00:00.000")
    insert_token(t2_id, "LP-102", "usr-s2", "HIGH", "WAITING", "2026-08-20 10:05:00.000")
    insert_token(t3_id, "LP-103", "usr-s3", "NORMAL", "WAITING", "2026-08-20 10:10:00.000")

    # Staff triggers next available slot
    res = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert res.status_code == 200, f"Calling NEXT failed: {res.text}"
    promoted_token = res.json()["token"]

    # Priority token should be promoted
    assert promoted_token["id"] == t2_id, f"Expected HIGH priority token {t2_id} to be promoted, got {promoted_token['id']}"
    assert promoted_token["status"] == "SERVING"

    # Verify in DB: exactly 1 token is SERVING, 2 remain WAITING
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT status, COUNT(*) FROM tokens WHERE service_id = 'srv-lp' GROUP BY status;")
    status_counts = dict(cursor.fetchall())
    conn.close()

    assert status_counts.get("SERVING") == 1, "Exactly one token should be in SERVING state."
    assert status_counts.get("WAITING") == 2, "Remaining candidates must remain in WAITING state."


def test_h9b_invalid_entries_and_starvation_resistance():
    """
    H9-B: Invalid Entries + Starvation Resistance in Waitlist.

    Verifies:
    1. Cancelled entries in the waitlist are NEVER promoted.
    2. Completed or skipped entries are NEVER promoted.
    3. Only valid active candidates are promoted.
    4. A sequence of available slots successfully promotes eligible candidates without
       data corruption or resurrecting dead tokens.
    """
    clean_all_tokens()

    t_cancelled = f"tkn-canc-{uuid.uuid4().hex[:6]}"
    t_completed = f"tkn-comp-{uuid.uuid4().hex[:6]}"
    t_valid_1 = f"tkn-val1-{uuid.uuid4().hex[:6]}"
    t_valid_2 = f"tkn-val2-{uuid.uuid4().hex[:6]}"

    insert_token(t_cancelled, "LP-001", "usr-canc", "NORMAL", "CANCELLED", "2026-08-20 09:00:00.000")
    insert_token(t_completed, "LP-002", "usr-comp", "NORMAL", "COMPLETED", "2026-08-20 09:10:00.000")
    insert_token(t_valid_1, "LP-003", "usr-val1", "NORMAL", "WAITING", "2026-08-20 09:20:00.000")
    insert_token(t_valid_2, "LP-004", "usr-val2", "NORMAL", "WAITING", "2026-08-20 09:30:00.000")

    # 1. First promotion
    res1 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert res1.status_code == 200
    token1 = res1.json()["token"]
    assert token1["id"] == t_valid_1, f"Expected valid token {t_valid_1} to be promoted, got {token1['id']}"

    # Complete token 1
    client.post(f"/api/staff/tokens/{t_valid_1}/complete", headers={"Authorization": "Bearer mock-token-staff"})

    # 2. Second promotion
    res2 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert res2.status_code == 200
    token2 = res2.json()["token"]
    assert token2["id"] == t_valid_2, f"Expected valid token {t_valid_2} to be promoted, got {token2['id']}"

    # Complete token 2
    client.post(f"/api/staff/tokens/{t_valid_2}/complete", headers={"Authorization": "Bearer mock-token-staff"})

    # 3. Third attempt: Queue is now empty (only CANCELLED and COMPLETED remain)
    res3 = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
    assert res3.status_code == 400, "Calling NEXT on empty waitlist should be rejected"

    # Invariant: CANCELLED token was never altered
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM tokens WHERE id = ?;", (t_cancelled,))
    assert cursor.fetchone()[0] == "CANCELLED", "Cancelled token was incorrectly resurrected."
    conn.close()


def test_h9c_concurrent_exactly_once_promotion():
    """
    H9-C: Concurrent Exactly-Once Promotion.

    Verifies:
    1. When multiple concurrent requests attempt to promote into a single slot,
       exactly one candidate is promoted.
    2. No candidate is promoted twice.
    3. Database state maintains strict single-serving capacity for the counter.
    """
    clean_all_tokens()

    # Insert 3 waiting candidates
    for i in range(3):
        t_id = f"tkn-conc-p{i}-{uuid.uuid4().hex[:6]}"
        insert_token(t_id, f"LP-80{i}", f"usr-cp-{i}", "NORMAL", "WAITING", f"2026-08-20 10:0{i}:00.000")

    num_threads = 5
    barrier = threading.Barrier(num_threads)
    results = []

    def promote_worker():
        barrier.wait()
        res = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
        return res

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(promote_worker) for _ in range(num_threads)]
        for f in futures:
            results.append(f.result())

    successes = [r for r in results if r.status_code == 200]

    # Exactly one request can successfully transition the counter from idle to SERVING
    assert len(successes) == 1, f"Expected exactly 1 successful promotion, got {len(successes)}. Conflicting concurrent promotions succeeded!"

    # Direct database verification
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, status FROM tokens WHERE counter_id = 'cntr-lp-2' AND status = 'SERVING';")
    serving_tokens = cursor.fetchall()
    conn.close()

    assert len(serving_tokens) == 1, f"Database shows {len(serving_tokens)} serving tokens at counter, expected exactly 1."
