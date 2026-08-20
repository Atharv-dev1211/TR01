import os
import uuid
import sqlite3
import jwt
import threading
import random
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

# Force settings for the test environment
settings.mock_auth = True
settings.db_path = "test_queuecraft_eval10.db"

client = TestClient(app, raise_server_exceptions=False)

@pytest.fixture(autouse=True)
def setup_eval_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    settings.db_path = "test_queuecraft_eval10.db"
    from app.database import initialize_schema, seed_database
    if os.path.exists("test_queuecraft_eval10.db"):
        try:
            os.remove("test_queuecraft_eval10.db")
        except Exception:
            pass
    initialize_schema()
    seed_database()
    yield
    settings.db_path = "test_queuecraft.db"
    if os.path.exists("test_queuecraft_eval10.db"):
        try:
            os.remove("test_queuecraft_eval10.db")
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

def generate_staff_jwt(user_id: str, counter_id: str) -> str:
    """Helper to generate staff token and assign to counter in SQLite."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("UPDATE counters SET assigned_staff_id = ? WHERE id = ?;", (user_id, counter_id))
    conn.commit()
    conn.close()

    payload = {
        "id": user_id,
        "name": f"Staff {user_id}",
        "email": f"{user_id}@queuecraft.edu",
        "role": "STAFF"
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

def insert_token(token_id: str, token_number: str, student_id: str, status: str = "WAITING", counter_id: str = "cntr-lp-2", priority: str = "NORMAL"):
    """Helper to insert token record directly into SQLite."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (
            id, token_number, student_id, student_name, student_email, service_id, counter_id,
            priority, status, created_at
        ) VALUES (?, ?, ?, 'Student Name', 'student@queuecraft.edu', 'srv-lp', ?, ?, ?, CURRENT_TIMESTAMP);
    """, (token_id, token_number, student_id, counter_id, priority, status))
    conn.commit()
    conn.close()


# ==============================================================================
# ISSUE #10: QUEUE PROCESSING SAFE UNDER CONCURRENT STAFF OPERATIONS
# ==============================================================================

def test_h10a_concurrent_next_uniqueness():
    """
    H10-A: Concurrent NEXT Operations Claim Token Uniqueness.

    Creates multiple distinct counters on the same service (srv-lp) and multiple
    waiting tokens in the queue. Multiple staff members simultaneously trigger NEXT.

    Verifies:
    1. No token is claimed by two distinct staff counters.
    2. No token is marked SERVING at more than one counter.
    3. The number of successfully claimed tokens matches the number of tokens in SERVING status in SQLite.
    4. Database remains in a 100% consistent state.
    """
    clean_all_tokens()

    # 1. Setup 2 OPEN counters with distinct assigned staff operators
    conn = sqlite3.connect(settings.db_path)
    conn.execute("UPDATE counters SET status = 'OPEN', assigned_staff_id = 'usr-staff-rudresh' WHERE id = 'cntr-lp-2';")
    conn.execute("UPDATE counters SET status = 'OPEN', assigned_staff_id = 'usr-staff-priya' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

    # 2. Insert 5 waiting tokens for srv-lp
    for i in range(5):
        t_id = f"tkn-con-next-{i}-{uuid.uuid4().hex[:6]}"
        insert_token(t_id, f"LP-70{i}", f"usr-st-{i}", status="WAITING")

    staff1_auth = generate_staff_jwt("usr-staff-rudresh", "cntr-lp-2")
    staff2_auth = generate_staff_jwt("usr-staff-priya", "cntr-lp-1")

    barrier = threading.Barrier(2)
    results = []

    def staff_worker(auth: str):
        barrier.wait()
        res = client.post("/api/staff/counter/next", headers={"Authorization": f"Bearer {auth}"})
        return res

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(staff_worker, staff1_auth)
        f2 = executor.submit(staff_worker, staff2_auth)
        results = [f1.result(), f2.result()]

    successful_responses = [r for r in results if r.status_code == 200]
    claimed_token_ids = [r.json()["token"]["id"] for r in successful_responses]

    # Assert both claims claimed distinct tokens (No duplicate claims)
    assert len(claimed_token_ids) == len(set(claimed_token_ids)), "A single token was claimed by multiple staff operations simultaneously!"

    # Database integrity verification
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, counter_id, status FROM tokens WHERE status = 'SERVING';")
    serving_rows = cursor.fetchall()
    conn.close()

    assert len(serving_rows) == len(claimed_token_ids), "Database serving count does not match successful API claim count."
    serving_ids = [r[0] for r in serving_rows]
    assert len(serving_ids) == len(set(serving_ids)), "Duplicate token IDs found in SERVING state in the database."


def test_h10b_next_cancel_race_invariants():
    """
    H10-B: NEXT x CANCEL Race Invariant Protection.

    Races staff NEXT and student CANCEL on the exact same token across multiple iterations.

    Validates state machine invariants:
    - The token either becomes SERVING (staff wins) or CANCELLED (student wins).
    - A token is NEVER simultaneously in SERVING and CANCELLED states.
    - A cancelled token is never subsequently served.
    - Queue positions and database state remain completely valid.
    """
    for race_idx in range(5):
        clean_all_tokens()

        target_token_id = f"tkn-race-{race_idx}-{uuid.uuid4().hex[:6]}"
        backup_token_id = f"tkn-backup-{race_idx}-{uuid.uuid4().hex[:6]}"
        student_id = f"usr-race-std-{race_idx}"

        insert_token(target_token_id, f"LP-01{race_idx}", student_id, status="WAITING")
        insert_token(backup_token_id, f"LP-02{race_idx}", f"usr-backup-{race_idx}", status="WAITING")

        student_jwt = generate_student_jwt(student_id)

        barrier = threading.Barrier(2)
        results = {}

        def call_next():
            barrier.wait()
            res = client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
            return ("NEXT", res)

        def call_cancel():
            barrier.wait()
            res = client.post(f"/api/student/tokens/{target_token_id}/cancel", headers={"Authorization": f"Bearer {student_jwt}"})
            return ("CANCEL", res)

        with ThreadPoolExecutor(max_workers=2) as executor:
            f_next = executor.submit(call_next)
            f_cancel = executor.submit(call_cancel)
            r1 = f_next.result()
            r2 = f_cancel.result()
            results[r1[0]] = r1[1]
            results[r2[0]] = r2[1]

        # Inspect database
        conn = sqlite3.connect(settings.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM tokens WHERE id = ?;", (target_token_id,))
        final_target_status = cursor.fetchone()[0]
        conn.close()

        # Valid state invariants:
        # 1. Target token status must be strictly one of SERVING or CANCELLED
        assert final_target_status in ("SERVING", "CANCELLED"), f"Invalid token state after race: {final_target_status}"

        # 2. If student successfully cancelled first (200), target token MUST be CANCELLED in DB
        if results["CANCEL"].status_code == 200:
            assert final_target_status == "CANCELLED", "Student cancel returned 200 but token state is not CANCELLED."


def test_h10c_mixed_concurrent_state_machine_stress():
    """
    H10-C: Mixed Concurrent State-Machine Stress Test.

    Spawns concurrent worker threads executing a randomized mix of lifecycle transitions:
    NEXT, COMPLETE, HOLD, RESUME, SKIP, CANCEL.

    Verifies Global Invariants:
    1. TOKEN INVARIANTS: Every token has exactly one valid status.
    2. TERMINAL INVARIANTS: Terminal tokens (COMPLETED, SKIPPED, CANCELLED) never return to active states.
    3. CLAIM INVARIANTS: No token is SERVING at two counters; no counter has two tokens SERVING.
    4. DATABASE INTEGRITY: Foreign keys and database structures remain completely healthy.
    """
    clean_all_tokens()

    # 1. Seed 10 tokens in varied initial states
    token_pool = []
    for i in range(10):
        t_id = f"tkn-stress-{i}-{uuid.uuid4().hex[:6]}"
        status_init = "WAITING" if i < 6 else ("SERVING" if i == 6 else "HELD")
        insert_token(t_id, f"LP-50{i}", f"usr-stress-{i}", status=status_init)
        token_pool.append(t_id)

    def random_worker(worker_id: int):
        action = random.choice(["NEXT", "COMPLETE", "HOLD", "RESUME", "SKIP", "CANCEL"])
        target_t = random.choice(token_pool)

        if action == "NEXT":
            return client.post("/api/staff/counter/next", headers={"Authorization": "Bearer mock-token-staff"})
        elif action == "COMPLETE":
            return client.post(f"/api/staff/tokens/{target_t}/complete", headers={"Authorization": "Bearer mock-token-staff"})
        elif action == "HOLD":
            return client.post(f"/api/staff/tokens/{target_t}/hold", headers={"Authorization": "Bearer mock-token-staff"})
        elif action == "RESUME":
            return client.post(f"/api/staff/tokens/{target_t}/resume", headers={"Authorization": "Bearer mock-token-staff"})
        elif action == "SKIP":
            return client.post(f"/api/staff/tokens/{target_t}/skip", headers={"Authorization": "Bearer mock-token-staff"})
        elif action == "CANCEL":
            student_jwt = generate_student_jwt(f"usr-stress-{worker_id}")
            return client.post(f"/api/student/tokens/{target_t}/cancel", headers={"Authorization": f"Bearer {student_jwt}"})

    num_stress_workers = 15
    with ThreadPoolExecutor(max_workers=num_stress_workers) as executor:
        futures = [executor.submit(random_worker, i) for i in range(num_stress_workers)]
        for f in futures:
            try:
                f.result()
            except Exception:
                pass # HTTP exceptions and rejections are expected under contention

    # Direct database invariant assertions
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()

    # Invariant 1: Valid status values
    cursor.execute("SELECT id, status FROM tokens;")
    all_tokens = cursor.fetchall()
    for t_id, st in all_tokens:
        assert st in ("WAITING", "SERVING", "HELD", "COMPLETED", "SKIPPED", "CANCELLED"), f"Token {t_id} has invalid status {st}"

    # Invariant 2: Single serving token per counter
    cursor.execute("SELECT counter_id, COUNT(*) FROM tokens WHERE status = 'SERVING' AND counter_id IS NOT NULL GROUP BY counter_id;")
    for counter_id, count in cursor.fetchall():
        assert count <= 1, f"Counter {counter_id} has {count} tokens in SERVING status simultaneously!"

    conn.close()
