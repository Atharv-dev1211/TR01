import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

# Force settings for the test environment
settings.mock_auth = True
settings.db_path = "test_queuecraft.db"

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    from app.database import initialize_schema, seed_database
    initialize_schema()
    seed_database()
    yield
    # Cleanup test database file
    if os.path.exists("test_queuecraft.db"):
        try:
            os.remove("test_queuecraft.db")
        except PermissionError:
            pass

def test_health():
    """
    Verify that the health check endpoint returns 200 and matches the expected JSON structure.
    """
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "QueueCraft Staff Operations Module"
    assert "timestamp" in data

def test_unauthenticated_access():
    """
    Verify that accessing student endpoints without authentication returns 403 Forbidden.
    """
    response = client.get("/api/student/services")
    assert response.status_code == 403

def test_student_services_success():
    """
    Verify that an authenticated student user can successfully retrieve services with embedded counter metadata.
    """
    response = client.get(
        "/api/student/services",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "services" in data
    assert len(data["services"]) > 0
    
    # Check format of services
    for service in data["services"]:
        assert "id" in service
        assert "name" in service
        assert "code" in service
        assert "counters" in service
        assert isinstance(service["counters"], list)

    # Find a service that has counters mapped (e.g. Library Printer or Canteen)
    service_with_counters = next((s for s in data["services"] if len(s["counters"]) > 0), None)
    assert service_with_counters is not None, "Seeded data should contain at least one service with active counters"
    
    first_counter = service_with_counters["counters"][0]
    assert "id" in first_counter
    assert "service_id" in first_counter
    assert "name" in first_counter
    assert "status" in first_counter
    assert "queue_size" in first_counter
    assert "estimated_wait_time" in first_counter

def test_student_counters_success():
    """
    Verify that an authenticated student user can successfully retrieve raw counters linked to parent service information.
    """
    response = client.get(
        "/api/student/counters",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    
    first_counter = data[0]
    assert "id" in first_counter
    assert "name" in first_counter
    assert "service_id" in first_counter
    assert "status" in first_counter
    assert "service_name" in first_counter
    assert "service_code" in first_counter

def test_authorization_role_restriction():
    """
    Verify that access to student endpoints is blocked for users with roles other than STUDENT.
    """
    response = client.get(
        "/api/student/services",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert response.status_code == 403
    assert "Forbidden" in response.json()["message"]

def test_role_escalation_mitigation_admin_email():
    """
    Verify that a new auto-synchronized user with an admin-like email gets role STUDENT.
    """
    import jwt
    token_payload = {
        "id": "usr-hacker-admin",
        "email": "admin-hacker@example.com",
        "name": "Admin Hacker",
        "role": "ADMIN"  # Client-supplied claim should be ignored
    }
    encoded_token = jwt.encode(token_payload, settings.jwt_secret, algorithm="HS256")
    
    # Try calling student endpoint with this token (should be allowed as they are a STUDENT)
    response = client.get(
        "/api/student/services",
        headers={"Authorization": f"Bearer {encoded_token}"}
    )
    assert response.status_code == 200

    # Query the test database to verify they were auto-synced as STUDENT
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", ("usr-hacker-admin",))
    role = cursor.fetchone()[0]
    conn.close()
    assert role == "STUDENT"

def test_role_escalation_mitigation_staff_email():
    """
    Verify that a new auto-synchronized user with a staff-like email gets role STUDENT.
    """
    import jwt
    token_payload = {
        "id": "usr-hacker-staff",
        "email": "staff-hacker@example.com",
        "name": "Staff Hacker",
        "role": "STAFF"  # Client-supplied claim should be ignored
    }
    encoded_token = jwt.encode(token_payload, settings.jwt_secret, algorithm="HS256")
    
    # Try calling student endpoint
    response = client.get(
        "/api/student/services",
        headers={"Authorization": f"Bearer {encoded_token}"}
    )
    assert response.status_code == 200

    # Verify they were auto-synced as STUDENT
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", ("usr-hacker-staff",))
    role = cursor.fetchone()[0]
    conn.close()
    assert role == "STUDENT"

def test_existing_admin_role_preserved():
    """
    Verify that an existing ADMIN user in SQLite maintains their ADMIN role.
    """
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", ("usr-admin-demo",))
    role = cursor.fetchone()[0]
    conn.close()
    assert role == "ADMIN"

def test_existing_staff_role_preserved():
    """
    Verify that an existing STAFF user in SQLite maintains their STAFF role.
    """
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", ("usr-staff-rudresh",))
    role = cursor.fetchone()[0]
    conn.close()
    assert role == "STAFF"

def test_production_environment_mock_auth_disabled():
    """
    Verify that initializing settings with environment='production' and mock_auth=True raises a validation error.
    """
    from pydantic import ValidationError
    from app.config import Settings
    
    with pytest.raises(ValidationError) as excinfo:
        Settings(environment="production", mock_auth=True)
    assert "mock_auth must be disabled in production environment" in str(excinfo.value)

def test_non_production_mock_auth_allowed():
    """
    Verify that non-production environments can still use mock_auth.
    """
    from app.config import Settings
    dev_settings = Settings(environment="development", mock_auth=True)
    assert dev_settings.mock_auth is True
    
    test_settings = Settings(environment="test", mock_auth=True)
    assert test_settings.mock_auth is True

# Phase 2 Token Lifecycle Tests

def test_successful_booking():
    """
    Verify successful booking for Central Library Printer (srv-lp) at Printer Counter 2 (cntr-lp-2).
    """
    # Use aarav who doesn't have an active waiting/serving token (tkn-041 is SERVING, tkn-042 is WAITING for neha/karan/aarav? wait, let's look at seeder)
    # Aarav has tkn-041 which is SERVING.
    # Ananya has tkn-042 which is WAITING.
    # Rohan has tkn-043 which is WAITING.
    # Diya has tkn-044 which is WAITING.
    # Vikram has tkn-045 which is HELD.
    # Aarav, Neha, Karan, and Vikram have active tokens.
    # Demo Student (usr-student-demo) has no active tokens in the seeder.
    response = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    token = data["token"]
    assert token["student_id"] == "usr-student-demo"
    assert token["service_id"] == "srv-lp"
    assert token["counter_id"] == "cntr-lp-2"
    assert token["status"] == "WAITING"
    assert "token_number" in token
    assert token["token_number"].startswith("LP-")

def test_booking_invalid_service():
    """
    Verify booking fails for a non-existent service.
    """
    response = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-invalid", "counter_id": "cntr-lp-2"},
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 404
    assert "Service not found" in response.json()["message"]

def test_booking_invalid_counter():
    """
    Verify booking fails for a non-existent counter or mismatch.
    """
    response = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-invalid"},
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 404

def test_booking_duplicate_active_token():
    """
    Verify that a student cannot book multiple active tokens.
    """
    # Demo Student already booked one in test_successful_booking.
    # Try booking another active token.
    response = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-cnt", "counter_id": "cntr-cnt-1"},
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 400
    assert "already have an active token" in response.json()["message"]

def test_get_active_token():
    """
    Verify retrieving the student's current active token.
    """
    response = client.get(
        "/api/student/tokens/active",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["token"] is not None
    assert data["token"]["student_id"] == "usr-student-demo"

def test_cancel_own_token():
    """
    Verify a student can cancel their own active token.
    """
    # Find the active token
    active_res = client.get(
        "/api/student/tokens/active",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    token_id = active_res.json()["token"]["id"]

    # Cancel via PATCH method (which frontend uses)
    cancel_res = client.patch(
        f"/api/student/tokens/{token_id}/cancel",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["success"] is True

    # Check that active token is now null
    active_res_after = client.get(
        "/api/student/tokens/active",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert active_res_after.json()["token"] is None

def test_completed_previous_token_can_book_again():
    """
    Verify that once a student's active token is cancelled/completed, they can book again.
    """
    # Booking should succeed now since previous was cancelled.
    response = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 200

def test_token_history():
    """
    Verify historical tokens retrieval.
    """
    response = client.get(
        "/api/student/tokens/history",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "tokens" in data
    assert len(data["tokens"]) > 0
    # Our cancelled token should be in history
    assert any(t["status"] == "CANCELLED" for t in data["tokens"])

def test_ownership_enforcement():
    """
    Verify Student A cannot cancel Student B's token.
    """
    import jwt
    # Sign token for Student A (usr-student-a)
    student_a_token = jwt.encode(
        {"id": "usr-student-a", "email": "student_a@example.com", "name": "Student A"},
        settings.jwt_secret,
        algorithm="HS256"
    )
    # Sign token for Student B (usr-student-b)
    student_b_token = jwt.encode(
        {"id": "usr-student-b", "email": "student_b@example.com", "name": "Student B"},
        settings.jwt_secret,
        algorithm="HS256"
    )

    # Student A books a token
    book_res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {student_a_token}"}
    )
    token_id = book_res.json()["token"]["id"]

    # Student B attempts to cancel Student A's token
    cancel_res = client.patch(
        f"/api/student/tokens/{token_id}/cancel",
        headers={"Authorization": f"Bearer {student_b_token}"}
    )
    assert cancel_res.status_code == 403
    assert "Forbidden" in cancel_res.json()["message"]

def test_queue_position_and_people_ahead_recalculation():
    """
    Create a queue of waiting tokens, verify people ahead calculation,
    and verify people ahead count shifts when an ahead token gets cancelled.
    """
    import jwt
    t1 = jwt.encode({"id": "usr-q1", "email": "q1@example.com", "name": "Q1"}, settings.jwt_secret, algorithm="HS256")
    t2 = jwt.encode({"id": "usr-q2", "email": "q2@example.com", "name": "Q2"}, settings.jwt_secret, algorithm="HS256")
    t3 = jwt.encode({"id": "usr-q3", "email": "q3@example.com", "name": "Q3"}, settings.jwt_secret, algorithm="HS256")

    # Book T1, T2, T3
    r1 = client.post("/api/student/tokens/book", json={"service_id": "srv-cnt", "counter_id": "cntr-cnt-1"}, headers={"Authorization": f"Bearer {t1}"})
    r2 = client.post("/api/student/tokens/book", json={"service_id": "srv-cnt", "counter_id": "cntr-cnt-1"}, headers={"Authorization": f"Bearer {t2}"})
    r3 = client.post("/api/student/tokens/book", json={"service_id": "srv-cnt", "counter_id": "cntr-cnt-1"}, headers={"Authorization": f"Bearer {t3}"})

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 200

    token1_id = r1.json()["token"]["id"]
    token2_id = r2.json()["token"]["id"]
    token3_id = r3.json()["token"]["id"]

    # Get active token for Q3
    active_q3 = client.get("/api/student/tokens/active", headers={"Authorization": f"Bearer {t3}"})
    # T1 and T2 are ahead of T3 for counter cntr-cnt-1. Wait! Does the seeder already have any active tokens on cntr-cnt-1?
    # Let's check seeder: usr-staff-priya is OPEN on cntr-cnt-1, but no tokens are waiting/serving on cntr-cnt-1 in the seeder!
    # So there are exactly 2 tokens (T1, T2) ahead of T3.
    assert active_q3.json()["token"]["people_ahead"] == 2

    # Cancel T2
    cancel_res = client.patch(f"/api/student/tokens/{token2_id}/cancel", headers={"Authorization": f"Bearer {t2}"})
    assert cancel_res.status_code == 200

    # Verify Q3's people ahead shifts to 1
    active_q3_after = client.get("/api/student/tokens/active", headers={"Authorization": f"Bearer {t3}"})
    assert active_q3_after.json()["token"]["people_ahead"] == 1

def test_concurrent_booking_unique_token_numbers():
    """
    Test concurrent booking attempts, verifying atomic token number generation.
    """
    import jwt
    import threading
    import queue

    # Setup unique users
    tokens = []
    for i in range(10):
        t = jwt.encode(
            {"id": f"usr-thread-{i}", "email": f"thread-{i}@example.com", "name": f"Thread User {i}"},
            settings.jwt_secret,
            algorithm="HS256"
        )
        tokens.append(t)

    results = queue.Queue()

    def run_booking(auth_token):
        try:
            response = client.post(
                "/api/student/tokens/book",
                json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            results.put(response)
        except Exception as e:
            results.put(e)

    # Launch threads
    threads = []
    for auth_token in tokens:
        th = threading.Thread(target=run_booking, args=(auth_token,))
        threads.append(th)
        th.start()

    # Join threads
    for th in threads:
        th.join()

    # Verify results
    booking_numbers = []
    while not results.empty():
        res = results.get()
        assert not isinstance(res, Exception)
        assert res.status_code == 200
        booking_numbers.append(res.json()["token"]["token_number"])

    # Ensure all token numbers are distinct
    assert len(booking_numbers) == 10
    assert len(set(booking_numbers)) == 10


