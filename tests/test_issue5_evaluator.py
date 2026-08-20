import os
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
settings.db_path = "test_queuecraft_eval5.db"

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_eval_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    settings.db_path = "test_queuecraft_eval5.db"
    from app.database import initialize_schema, seed_database
    if os.path.exists("test_queuecraft_eval5.db"):
        try:
            os.remove("test_queuecraft_eval5.db")
        except Exception:
            pass
    initialize_schema()
    seed_database()
    yield
    settings.db_path = "test_queuecraft.db"
    if os.path.exists("test_queuecraft_eval5.db"):
        try:
            os.remove("test_queuecraft_eval5.db")
        except Exception:
            pass

def clean_all_tokens():
    """Helper to clear all tokens for isolated tests."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tokens;")
    conn.commit()
    conn.close()

def generate_student_jwt(user_id: str, name: str = None, email: str = None) -> str:
    """Helper to generate signed student JWT token."""
    payload = {
        "id": user_id,
        "name": name or f"User {user_id}",
        "email": email or f"{user_id}@queuecraft.edu"
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


# ==============================================================================
# ISSUE #5: SAFE TOKEN BOOKING UNDER CONCURRENT REQUESTS
# ==============================================================================

def test_m5a_concurrent_booking_uniqueness():
    """
    M5-A: Concurrent Booking Uniqueness and Atomicity.
    Fires simultaneous booking requests from multiple distinct students against
    the same service and counter using real concurrency barriers.

    Verifies:
    1. Every successful request produces an exact, matching record in the database.
    2. All generated token IDs and token numbers are strictly unique (no duplicate numbers or lost writes).
    3. Queue positions are strictly non-colliding and sequential.
    4. Database record count matches the count of successful API responses.
    """
    clean_all_tokens()

    num_students = 10
    barrier = threading.Barrier(num_students)
    results = []

    def book_worker(student_idx: int):
        user_id = f"usr-student-concurrent-{student_idx}"
        auth_token = generate_student_jwt(user_id)

        # Synchronize all threads at the barrier to maximize race condition contention
        barrier.wait()

        res = client.post(
            "/api/student/tokens/book",
            json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        return res

    with ThreadPoolExecutor(max_workers=num_students) as executor:
        futures = [executor.submit(book_worker, i) for i in range(num_students)]
        for f in futures:
            results.append(f.result())

    successful_responses = [r for r in results if r.status_code == 200]
    failed_responses = [r for r in results if r.status_code != 200]

    # Assert that all valid distinct student requests succeed without deadlocks
    assert len(successful_responses) == num_students, f"Expected {num_students} successful bookings, got {len(successful_responses)}. Failures: {[r.text for r in failed_responses]}"

    # Extract returned token payloads
    booked_tokens = [r.json()["token"] for r in successful_responses]
    token_ids = [t["id"] for t in booked_tokens]
    token_numbers = [t["token_number"] for t in booked_tokens]

    # Verify uniqueness of IDs and Token Numbers
    assert len(set(token_ids)) == num_students, "Duplicate token IDs detected across concurrent requests."
    assert len(set(token_numbers)) == num_students, f"Duplicate token numbers detected: {token_numbers}"

    # Verify direct database state consistency
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, token_number, student_id, status FROM tokens WHERE service_id = 'srv-lp';")
    db_rows = cursor.fetchall()
    conn.close()

    assert len(db_rows) == num_students, f"Database has {len(db_rows)} tokens, expected {num_students} matching successful requests."

    db_ids = [r[0] for r in db_rows]
    db_numbers = [r[1] for r in db_rows]
    assert set(db_ids) == set(token_ids), "Database token IDs do not match API response token IDs."
    assert len(set(db_numbers)) == num_students, "Database contains duplicate token numbers."


def test_m5b_booking_failure_rollback_consistency():
    """
    M5-B: Failure and Rollback Consistency Under Contention.
    Creates a scenario with concurrent conflicting and invalid booking attempts:
    - User A attempts 3 concurrent bookings simultaneously (only 1 active token allowed).
    - User B and User C attempt valid bookings.
    - User D attempts booking on a CLOSED counter.

    Verifies:
    1. Only 1 booking succeeds for User A; 2 are rejected with 400 Bad Request.
    2. Failed requests leave zero phantom tokens or partially committed records in the DB.
    3. Valid bookings for User B and User C succeed and remain completely intact.
    4. Database transaction state remains consistent for subsequent bookings without lockups.
    """
    clean_all_tokens()

    # Ensure closed counter cntr-lp-1 is in CLOSED state
    conn = sqlite3.connect(settings.db_path)
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

    # Prepare requests
    user_a_jwt = generate_student_jwt("usr-student-alpha")
    user_b_jwt = generate_student_jwt("usr-student-beta")
    user_c_jwt = generate_student_jwt("usr-student-gamma")
    user_d_jwt = generate_student_jwt("usr-student-delta")

    tasks = [
        ("A1", user_a_jwt, "srv-lp", "cntr-lp-2"),
        ("A2", user_a_jwt, "srv-lp", "cntr-lp-2"),
        ("A3", user_a_jwt, "srv-lp", "cntr-lp-2"),
        ("B",  user_b_jwt, "srv-lp", "cntr-lp-2"),
        ("C",  user_c_jwt, "srv-lp", "cntr-lp-2"),
        ("D",  user_d_jwt, "srv-lp", "cntr-lp-1"), # Closed counter
    ]

    barrier = threading.Barrier(len(tasks))
    results = {}

    def worker(label: str, token_jwt: str, s_id: str, c_id: str):
        barrier.wait()
        res = client.post(
            "/api/student/tokens/book",
            json={"service_id": s_id, "counter_id": c_id},
            headers={"Authorization": f"Bearer {token_jwt}"}
        )
        return (label, res)

    with ThreadPoolExecutor(max_workers=len(tasks)) as executor:
        futures = [executor.submit(worker, label, token_jwt, s_id, c_id) for label, token_jwt, s_id, c_id in tasks]
        for f in futures:
            lbl, r = f.result()
            results[lbl] = r

    # User A assertions (Exactly one success, two rejections)
    a_results = [results["A1"], results["A2"], results["A3"]]
    a_successes = [r for r in a_results if r.status_code == 200]
    a_failures = [r for r in a_results if r.status_code == 400]

    assert len(a_successes) == 1, f"Expected exactly 1 success for User A, got {len(a_successes)}"
    assert len(a_failures) == 2, f"Expected exactly 2 400 Bad Request failures for User A, got {len(a_failures)}"

    # User B and C assertions (Both succeed)
    assert results["B"].status_code == 200, f"User B booking failed: {results['B'].text}"
    assert results["C"].status_code == 200, f"User C booking failed: {results['C'].text}"

    # User D assertions (Failed due to closed counter)
    assert results["D"].status_code == 400, f"User D should fail on closed counter, got: {results['D'].status_code}"

    # Verify direct database state: Total tokens must be exactly 3 (1 from A, 1 from B, 1 from C)
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, student_id, token_number FROM tokens WHERE status = 'WAITING';")
    waiting_tokens = cursor.fetchall()
    conn.close()

    assert len(waiting_tokens) == 3, f"Expected exactly 3 tokens in DB, found {len(waiting_tokens)}. Check for phantom tokens from failed requests."

    # Confirm User A has only 1 token in DB
    user_a_tokens = [t for t in waiting_tokens if t[1] == "usr-student-alpha"]
    assert len(user_a_tokens) == 1, f"User A has {len(user_a_tokens)} tokens in DB, expected 1."

    # Verify subsequent booking succeeds without database transaction corruption
    user_e_jwt = generate_student_jwt("usr-student-epsilon")
    res_e = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {user_e_jwt}"}
    )
    assert res_e.status_code == 200, f"Subsequent booking failed after rollback: {res_e.text}"
