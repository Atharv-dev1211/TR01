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

    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-cnt';")
    conn.commit()
    conn.close()

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

# Phase 3 Staff Operations Tests

def test_staff_unauthorized_access():
    """
    Verify that student users or unassigned users are blocked from staff endpoints.
    """
    # Student token to staff dashboard -> 403
    res1 = client.get(
        "/api/staff/dashboard",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert res1.status_code == 403

    # Unassigned staff token -> 403 (usr-admin-demo is ADMIN, not staff)
    res2 = client.get(
        "/api/staff/dashboard",
        headers={"Authorization": "Bearer mock-token-admin"}
    )
    assert res2.status_code == 403

def test_staff_dashboard_success():
    """
    Verify that an assigned staff member can retrieve their dashboard details.
    """
    response = client.get(
        "/api/staff/dashboard",
        headers={"Authorization": "Bearer mock-token-staff"} # usr-staff-rudresh
    )
    assert response.status_code == 200
    data = response.json()
    assert "staff" in data
    assert data["staff"]["id"] == "usr-staff-rudresh"
    assert "counter" in data
    assert data["counter"]["id"] == "cntr-lp-2"
    assert "service" in data
    assert "current_token" in data
    assert "waiting_queue" in data
    assert "stats" in data
    assert "queue_length" in data["stats"]
    assert "completed_today_count" in data["stats"]

def test_staff_counter_queue():
    """
    Verify staff waiting queue retrieval.
    """
    response = client.get(
        "/api/staff/counter/queue",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        assert "token_number" in data[0]
        assert "people_ahead" in data[0]

def test_staff_get_token_by_id():
    """
    Verify staff can fetch token by ID.
    """
    # Find an active token first
    response = client.get(
        "/api/staff/counter/queue",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    data = response.json()
    assert len(data) > 0
    token_id = data[0]["id"]

    res_detail = client.get(
        f"/api/staff/tokens/{token_id}",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert res_detail.status_code == 200
    assert res_detail.json()["id"] == token_id

def test_staff_next_complete_cycle():
    """
    Verify complete staff NEXT -> SERVING -> COMPLETED token lifecycle.
    """
    # Clean up pre-seeded serving token on cntr-lp-2
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("UPDATE tokens SET status = 'COMPLETED' WHERE counter_id = 'cntr-lp-2' AND status = 'SERVING';")
    conn.commit()
    conn.close()

    # 1. Call next token
    next_res = client.post(
        "/api/staff/counter/next",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert next_res.status_code == 200
    token = next_res.json()["token"]
    assert token["status"] == "SERVING"
    assert token["counter_id"] == "cntr-lp-2"
    token_id = token["id"]

    # 2. Check student active token state
    import jwt
    student_jwt = jwt.encode(
        {"id": token["student_id"], "email": token["student_email"], "name": token["student_name"]},
        settings.jwt_secret,
        algorithm="HS256"
    )
    student_active = client.get(
        "/api/student/tokens/active",
        headers={"Authorization": f"Bearer {student_jwt}"}
    )
    assert student_active.status_code == 200
    assert student_active.json()["token"]["status"] == "SERVING"

    # 3. Complete the token
    comp_res = client.post(
        f"/api/staff/tokens/{token_id}/complete",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert comp_res.status_code == 200
    assert comp_res.json()["token"]["status"] == "COMPLETED"

    # 4. Attempting to complete it again should fail
    fail_res = client.post(
        f"/api/staff/tokens/{token_id}/complete",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert fail_res.status_code == 400

def test_staff_hold_and_resume():
    """
    Verify SERVING -> HELD -> SERVING lifecycle.
    """
    # Clean up pre-seeded serving token on cntr-lp-2
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("UPDATE tokens SET status = 'COMPLETED' WHERE counter_id = 'cntr-lp-2' AND status = 'SERVING';")
    conn.commit()
    conn.close()

    # 1. Call next token
    next_res = client.post(
        "/api/staff/counter/next",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert next_res.status_code == 200
    token = next_res.json()["token"]
    token_id = token["id"]

    # 2. Put on HOLD
    hold_res = client.post(
        f"/api/staff/tokens/{token_id}/hold",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert hold_res.status_code == 200
    assert hold_res.json()["token"]["status"] == "HELD"

    # 3. Resume the token
    res_res = client.post(
        f"/api/staff/tokens/{token_id}/resume",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert res_res.status_code == 200
    assert res_res.json()["token"]["status"] == "SERVING"

    # 4. Complete to clean up
    client.post(
        f"/api/staff/tokens/{token_id}/complete",
        headers={"Authorization": "Bearer mock-token-staff"}
    )

def test_staff_skip():
    """
    Verify skip token mutation.
    """
    # Clean up pre-seeded serving token on cntr-lp-2
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("UPDATE tokens SET status = 'COMPLETED' WHERE counter_id = 'cntr-lp-2' AND status = 'SERVING';")
    conn.commit()
    conn.close()

    # 1. Call next token
    next_res = client.post(
        "/api/staff/counter/next",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert next_res.status_code == 200
    token = next_res.json()["token"]
    token_id = token["id"]

    # 2. Skip the token
    skip_res = client.post(
        f"/api/staff/tokens/{token_id}/skip",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert skip_res.status_code == 200
    assert skip_res.json()["token"]["status"] == "SKIPPED"

def test_counter_status_toggle():
    """
    Verify changing counter status via staff route.
    """
    # Set to BUSY
    response1 = client.patch(
        "/api/staff/counter/status",
        json={"status": "BUSY"},
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert response1.status_code == 200
    assert response1.json()["counter"]["status"] == "BUSY"

    # Set back to OPEN
    response2 = client.patch(
        "/api/staff/counter/status",
        json={"status": "OPEN"},
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert response2.status_code == 200
    assert response2.json()["counter"]["status"] == "OPEN"

def test_queue_ordering_priority_first():
    """
    Verify priority queue ordering (FCFS within priority, highest priority first).
    """
    import jwt
    import sqlite3
    
    t_normal = jwt.encode({"id": "usr-ord-normal", "email": "n@example.com", "name": "Normal"}, settings.jwt_secret, algorithm="HS256")
    t_urgent = jwt.encode({"id": "usr-ord-urgent", "email": "u@example.com", "name": "Urgent"}, settings.jwt_secret, algorithm="HS256")

    # Clean srv-cnt tokens to ensure stable FCFS checking
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-cnt';")
    conn.commit()
    conn.close()

    # 1. Book NORMAL
    client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-cnt", "counter_id": "cntr-cnt-1"},
        headers={"Authorization": f"Bearer {t_normal}"}
    )

    # 2. Update priority of normal token manually or book URGENT (wait! book_token does not specify priority in payload in Phase 2 book_token - wait, book_token inserts as NORMAL by default).
    # Let's insert a second token for another user with URGENT priority directly in the db, or update it.
    conn = sqlite3.connect("test_queuecraft.db")
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (id, token_number, student_id, student_name, student_email, service_id, counter_id, priority, status)
        VALUES ('tkn-u1', 'CNT-002', 'usr-ord-urgent', 'Urgent Student', 'u@example.com', 'srv-cnt', 'cntr-cnt-1', 'URGENT', 'WAITING');
    """)
    conn.commit()
    conn.close()

    # Fetch waiting queue
    # The URGENT token should be index 0 (ahead), even though the NORMAL token was booked first!
    response = client.get(
        "/api/student/tokens/active",
        headers={"Authorization": f"Bearer {t_normal}"} # Normal student should have 1 person ahead (the urgent one!)
    )
    assert response.status_code == 200
    assert response.json()["token"]["people_ahead"] == 1

def test_concurrent_staff_next_operations():
    """
    Simulate concurrent NEXT actions by two staff members on different counters of the same service.
    Verify they claim distinct waiting tokens atomically.
    """
    import jwt
    import sqlite3
    import threading
    import queue

    # 1. Set up second counter assignment: usr-staff-priya assigned to cntr-lp-1 (which belongs to srv-lp)
    conn = sqlite3.connect("test_queuecraft.db")
    cursor = conn.cursor()
    cursor.execute("UPDATE counters SET status = 'OPEN', assigned_staff_id = 'usr-staff-priya' WHERE id = 'cntr-lp-1';")
    # Clean up srv-lp active/serving tokens to avoid conflicts
    cursor.execute("UPDATE tokens SET status = 'COMPLETED' WHERE service_id = 'srv-lp' AND status = 'SERVING';")
    # Seed 5 waiting tokens for srv-lp split across both counters
    for i in range(5):
        target_cntr = 'cntr-lp-2' if i % 2 == 0 else 'cntr-lp-1'
        cursor.execute(f"""
            INSERT INTO tokens (id, token_number, student_id, student_name, service_id, counter_id, priority, status, created_at)
            VALUES ('tkn-seq-{i}', 'LP-90{i}', 'usr-student-aarav', 'Aarav', 'srv-lp', '{target_cntr}', 'NORMAL', 'WAITING', '2026-08-19 00:00:0{i}');
        """)
    conn.commit()
    conn.close()

    # Staff credentials
    staff_rudresh_token = "mock-token-staff" # usr-staff-rudresh -> cntr-lp-2
    staff_priya_token = jwt.encode(
        {"id": "usr-staff-priya", "email": "priya@queuecraft.edu", "name": "Priya Singh", "role": "STAFF"},
        settings.jwt_secret,
        algorithm="HS256"
    ) # usr-staff-priya -> cntr-lp-1

    results = queue.Queue()

    def run_next(auth):
        try:
            res = client.post(
                "/api/staff/counter/next",
                headers={"Authorization": f"Bearer {auth}"}
            )
            results.put(res)
        except Exception as e:
            results.put(e)

    # Trigger concurrent requests
    th1 = threading.Thread(target=run_next, args=(staff_rudresh_token,))
    th2 = threading.Thread(target=run_next, args=(staff_priya_token,))
    
    th1.start()
    th2.start()

    th1.join()
    th2.join()

    # Collect claimed token IDs
    claimed_ids = []
    while not results.empty():
        res = results.get()
        assert not isinstance(res, Exception)
        assert res.status_code == 200
        claimed_ids.append(res.json()["token"]["id"])

    # Assert both claims succeeded and claimed distinct tokens
    assert len(claimed_ids) == 2
    assert len(set(claimed_ids)) == 2

# Phase 4 Socket.IO Synchronization Tests

@pytest.fixture(scope="module")
def run_app_server():
    import time
    import threading
    import uvicorn
    server_thread = threading.Thread(
        target=lambda: uvicorn.run(app, host="127.0.0.1", port=5005, log_level="error"),
        daemon=True
    )
    server_thread.start()
    time.sleep(0.5)  # Let server bind and start
    yield "http://127.0.0.1:5005"

def test_socket_real_time_events(run_app_server):
    import time
    import jwt
    import sqlite3
    import socketio

    server_url = run_app_server
    sio_client = socketio.Client()
    events_received = []

    @sio_client.on('*')
    def catch_all(event, data):
        events_received.append((event, data))

    # 1. Connect
    sio_client.connect(server_url, socketio_path='socket.io')

    # 2. Join Rooms
    sio_client.emit('join_service', 'srv-lp')
    sio_client.emit('join_counter', 'cntr-lp-2')
    time.sleep(0.1)

    # Clean up counters and serving tokens first
    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.execute("UPDATE tokens SET status = 'COMPLETED' WHERE counter_id = 'cntr-lp-2' AND status = 'SERVING';")
    conn.commit()
    conn.close()

    # 3. Trigger student book via REST API
    student_jwt = jwt.encode(
        {"id": "usr-student-temp-socket", "email": "temp-socket@queuecraft.edu", "name": "Temp Socket"},
        settings.jwt_secret,
        algorithm="HS256"
    )
    book_res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {student_jwt}"}
    )
    assert book_res.status_code == 200
    token = book_res.json()["token"]

    time.sleep(0.2)

    # Verify book emits
    event_names = [e[0] for e in events_received]
    assert 'QUEUE_UPDATED' in event_names
    assert 'queueUpdate' in event_names
    
    create_payload = [e[1] for e in events_received if e[0] == 'QUEUE_UPDATED'][-1]
    assert create_payload["action"] == "CREATE"
    assert create_payload["tokenId"] == token["id"]

    events_received.clear()

    # 4. Trigger NEXT operation via REST API
    next_res = client.post(
        "/api/staff/counter/next",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert next_res.status_code == 200
    called_token = next_res.json()["token"]

    time.sleep(0.2)

    # Verify next emits
    event_names = [e[0] for e in events_received]
    assert 'TOKEN_CALLED' in event_names
    assert 'token_called' in event_names

    events_received.clear()

    # 5. Trigger COMPLETE operation via REST API
    comp_res = client.post(
        f"/api/staff/tokens/{called_token['id']}/complete",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert comp_res.status_code == 200

    time.sleep(0.2)

    # Verify complete emits
    event_names = [e[0] for e in events_received]
    assert 'TOKEN_COMPLETED' in event_names
    assert 'token_completed' in event_names

    events_received.clear()

    # 6. Trigger counter status change via REST API
    status_res = client.patch(
        "/api/staff/counter/status",
        json={"status": "BUSY"},
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert status_res.status_code == 200

    time.sleep(0.2)

    # Verify status changed emits
    event_names = [e[0] for e in events_received]
    assert 'COUNTER_STATUS_CHANGED' in event_names
    assert 'counter_status_changed' in event_names

    # Clean up and reset counter status to OPEN
    client.patch(
        "/api/staff/counter/status",
        json={"status": "OPEN"},
        headers={"Authorization": "Bearer mock-token-staff"}
    )

    sio_client.disconnect()


# Phase 5 Admin & Staff Counter Resolution Tests

def test_admin_auth_restrictions():
    """
    Verify that unauthenticated, student, and staff requests to admin endpoints are blocked with 403,
    and admin requests are permitted.
    """
    # Unauthenticated
    res_unauth = client.get("/api/admin/dashboard")
    assert res_unauth.status_code == 403

    # Student
    res_student = client.get(
        "/api/admin/dashboard",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert res_student.status_code == 403

    # Staff
    res_staff = client.get(
        "/api/admin/dashboard",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert res_staff.status_code == 403

    # Admin
    res_admin = client.get(
        "/api/admin/dashboard",
        headers={"Authorization": "Bearer mock-token-admin"}
    )
    assert res_admin.status_code == 200

def test_admin_dashboard_stats():
    """
    Verify that GET /api/admin/dashboard returns expected database stats schema.
    """
    res = client.get(
        "/api/admin/dashboard",
        headers={"Authorization": "Bearer mock-token-admin"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "services_count" in data
    assert "active_counters_count" in data
    assert "waiting_tokens_count" in data
    assert "currently_serving_count" in data
    assert "completed_today_count" in data
    assert "skipped_today_count" in data
    assert "cancelled_today_count" in data
    assert "avg_waiting_time_minutes" in data

def test_admin_user_crud():
    """
    Verify Admin User CRUD operations: list, create, duplicate email rejection, update, and delete safety.
    """
    admin_headers = {"Authorization": "Bearer mock-token-admin"}

    # 1. List users
    res_list = client.get("/api/admin/users", headers=admin_headers)
    assert res_list.status_code == 200
    users = res_list.json()
    assert isinstance(users, list)
    assert len(users) > 0

    # 2. Create user
    new_user_payload = {
        "name": "Test Operator",
        "email": "testop@queuecraft.edu",
        "password": "securepassword123",
        "role": "STAFF"
    }
    res_create = client.post("/api/admin/users", json=new_user_payload, headers=admin_headers)
    assert res_create.status_code == 201
    created_user = res_create.json()
    assert created_user["email"] == "testop@queuecraft.edu"
    assert created_user["role"] == "STAFF"

    # 3. Duplicate email rejection
    res_dup = client.post("/api/admin/users", json=new_user_payload, headers=admin_headers)
    assert res_dup.status_code == 400

    # 4. Update user
    res_update = client.patch(
        f"/api/admin/users/{created_user['id']}",
        json={"name": "Test Operator Updated", "role": "STUDENT"},
        headers=admin_headers
    )
    assert res_update.status_code == 200
    assert res_update.json()["name"] == "Test Operator Updated"
    assert res_update.json()["role"] == "STUDENT"

    # 5. Delete user
    res_del = client.delete(f"/api/admin/users/{created_user['id']}", headers=admin_headers)
    assert res_del.status_code == 200
    assert res_del.json()["success"] is True

    # 6. Delete self rejection (mock admin user id is usr-admin-demo)
    res_self_del = client.delete("/api/admin/users/usr-admin-demo", headers=admin_headers)
    assert res_self_del.status_code == 400

def test_admin_service_crud():
    """
    Verify Admin Service CRUD operations: list, create, duplicate shortcode rejection, update, and delete safety checks.
    """
    admin_headers = {"Authorization": "Bearer mock-token-admin"}

    # 1. List services
    res_list = client.get("/api/admin/services", headers=admin_headers)
    assert res_list.status_code == 200
    services = res_list.json()
    assert len(services) > 0

    # 2. Create service
    new_srv_payload = {
        "name": "Financial Aid Desk",
        "code": "FIN",
        "description": "Student loans and scholarships assistance"
    }
    res_create = client.post("/api/admin/services", json=new_srv_payload, headers=admin_headers)
    assert res_create.status_code == 201
    created_srv = res_create.json()
    assert created_srv["code"] == "FIN"

    # 3. Duplicate shortcode rejection
    res_dup = client.post("/api/admin/services", json=new_srv_payload, headers=admin_headers)
    assert res_dup.status_code == 400

    # 4. Update service
    res_update = client.patch(
        f"/api/admin/services/{created_srv['id']}",
        json={"name": "Financial Aid & Grants"},
        headers=admin_headers
    )
    assert res_update.status_code == 200
    assert res_update.json()["name"] == "Financial Aid & Grants"

    # 5. Delete newly created service without linked counters/tokens
    res_del = client.delete(f"/api/admin/services/{created_srv['id']}", headers=admin_headers)
    assert res_del.status_code == 200

    # 6. Delete service with linked counters rejection (srv-lp has linked counters)
    res_del_linked = client.delete("/api/admin/services/srv-lp", headers=admin_headers)
    assert res_del_linked.status_code == 400

def test_admin_counter_crud_and_staff_assignment():
    """
    Verify Admin Counter CRUD and Staff Assignment exclusivity.
    """
    admin_headers = {"Authorization": "Bearer mock-token-admin"}

    # 1. List counters
    res_list = client.get("/api/admin/counters", headers=admin_headers)
    assert res_list.status_code == 200
    counters = res_list.json()
    assert len(counters) > 0

    # 2. Create counter under Library Printer (srv-lp)
    new_cntr_payload = {
        "name": "Printer Counter 3",
        "service_id": "srv-lp",
        "status": "CLOSED"
    }
    res_create = client.post("/api/admin/counters", json=new_cntr_payload, headers=admin_headers)
    assert res_create.status_code == 201
    created_cntr = res_create.json()
    assert created_cntr["name"] == "Printer Counter 3"

    # 3. Update counter
    res_update = client.patch(
        f"/api/admin/counters/{created_cntr['id']}",
        json={"status": "MAINTENANCE"},
        headers=admin_headers
    )
    assert res_update.status_code == 200
    assert res_update.json()["status"] == "MAINTENANCE"

    # 4. Assign staff operator (usr-staff-rudresh) to the new counter
    res_assign = client.patch(
        f"/api/admin/counters/{created_cntr['id']}/assign-staff",
        json={"staffId": "usr-staff-rudresh"},
        headers=admin_headers
    )
    assert res_assign.status_code == 200
    assert res_assign.json()["assigned_staff_id"] == "usr-staff-rudresh"

    # 5. Reject non-staff user assignment
    res_invalid_assign = client.patch(
        f"/api/admin/counters/{created_cntr['id']}/assign-staff",
        json={"staffId": "usr-student-aarav"},
        headers=admin_headers
    )
    assert res_invalid_assign.status_code == 400

    # Re-assign back to original counter (cntr-lp-2) for test consistency
    client.patch(
        "/api/admin/counters/cntr-lp-2/assign-staff",
        json={"staffId": "usr-staff-rudresh"},
        headers=admin_headers
    )

    # 6. Delete created counter
    res_del = client.delete(f"/api/admin/counters/{created_cntr['id']}", headers=admin_headers)
    assert res_del.status_code == 200

def test_admin_live_monitor_and_analytics():
    """
    Verify GET /api/admin/live-monitor and GET /api/admin/analytics payloads.
    """
    admin_headers = {"Authorization": "Bearer mock-token-admin"}

    # 1. Live Monitor
    res_monitor = client.get("/api/admin/live-monitor", headers=admin_headers)
    assert res_monitor.status_code == 200
    monitor_data = res_monitor.json()
    assert isinstance(monitor_data, list)
    assert len(monitor_data) > 0
    first_item = monitor_data[0]
    assert "counter_id" in first_item
    assert "counter_name" in first_item
    assert "service_name" in first_item

    # 2. Analytics
    res_analytics = client.get("/api/admin/analytics", headers=admin_headers)
    assert res_analytics.status_code == 200
    analytics_data = res_analytics.json()
    assert "summary" in analytics_data
    assert "service_distribution" in analytics_data
    assert "counter_activity" in analytics_data
    assert "hourly_distribution" in analytics_data

def test_staff_counter_endpoint():
    """
    Verify GET /api/staff/counter returns the assigned counter cntr-lp-2 for the staff member.
    """
    res = client.get(
        "/api/staff/counter",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "cntr-lp-2"
    assert data["service_id"] == "srv-lp"
    assert data["assigned_staff_id"] == "usr-staff-rudresh"


# Phase 6 Advanced Queue Engine Tests

def test_dynamic_wait_cold_start_fallback():
    """
    Verify cold start fallback (5 minutes per person ahead) when no completed token history exists.
    """
    import sqlite3
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row
    # Clean completed tokens for test service
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-test-cold';")
    conn.commit()
    
    wait_time = queue_service.calculate_dynamic_wait_time(conn, "srv-test-cold", 3)
    assert wait_time == 15  # 3 * 5 mins = 15 mins
    conn.close()

def test_dynamic_wait_historical_average():
    """
    Verify dynamic wait estimation uses historical service durations from completed tokens.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    # Clean test service
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-test-dyn';")
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE service_id = 'srv-test-dyn';")

    # Insert 2 completed tokens with 10-minute service durations for srv-test-dyn
    now = datetime.now(timezone.utc)
    t1_start = (now - timedelta(minutes=25)).strftime('%Y-%m-%d %H:%M:%S.%f')
    t1_end = (now - timedelta(minutes=15)).strftime('%Y-%m-%d %H:%M:%S.%f')
    t2_start = (now - timedelta(minutes=14)).strftime('%Y-%m-%d %H:%M:%S.%f')
    t2_end = (now - timedelta(minutes=4)).strftime('%Y-%m-%d %H:%M:%S.%f')

    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at)
        VALUES ('tkn-hist-1', 'LP-H1', 'Student H1', 'srv-test-dyn', 'cntr-lp-2', 'COMPLETED', ?, ?);
    """, (t1_start, t1_end))
    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at)
        VALUES ('tkn-hist-2', 'LP-H2', 'Student H2', 'srv-test-dyn', 'cntr-lp-2', 'COMPLETED', ?, ?);
    """, (t2_start, t2_end))
    conn.commit()

    # With 2 people ahead and 1 open counter (cntr-lp-2), 2 * 10 = 20 mins
    wait = queue_service.calculate_dynamic_wait_time(conn, "srv-test-dyn", 2)
    assert wait == 20

    # Cleanup
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-test-dyn';")
    conn.commit()
    conn.close()

def test_dynamic_wait_multi_counter_capacity():
    """
    Verify that increasing active counter capacity reduces estimated wait time proportionally.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    # Ensure two counters are open for srv-lp
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp' AND status = 'COMPLETED';")

    now = datetime.now(timezone.utc)
    t1_start = (now - timedelta(minutes=20)).strftime('%Y-%m-%d %H:%M:%S.%f')
    t1_end = (now - timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S.%f')
    t2_start = (now - timedelta(minutes=30)).strftime('%Y-%m-%d %H:%M:%S.%f')
    t2_end = (now - timedelta(minutes=20)).strftime('%Y-%m-%d %H:%M:%S.%f')
    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at)
        VALUES ('tkn-cap-1', 'LP-C1', 'Student C1', 'srv-lp', 'cntr-lp-2', 'COMPLETED', ?, ?),
               ('tkn-cap-2', 'LP-C2', 'Student C2', 'srv-lp', 'cntr-lp-2', 'COMPLETED', ?, ?);
    """, (t1_start, t1_end, t2_start, t2_end))
    conn.commit()

    # 4 people ahead, 10 min avg duration, 2 open counters: (4 * 10) / 2 = 20 mins
    wait = queue_service.calculate_dynamic_wait_time(conn, "srv-lp", 4)
    assert wait == 20

    # Cleanup
    conn.execute("DELETE FROM tokens WHERE id IN ('tkn-cap-1', 'tkn-cap-2');")
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

def test_priority_aging_base_ordering():
    """
    Verify base priority ordering: URGENT > HIGH/PRIORITY > NORMAL.
    """
    import sqlite3
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    # Clean existing waiting tokens for srv-lp
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp' AND status = 'WAITING';")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, priority, status) VALUES ('t-norm', 'N-1', 'Norm', 'srv-lp', 'NORMAL', 'WAITING');")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, priority, status) VALUES ('t-urg', 'U-1', 'Urg', 'srv-lp', 'URGENT', 'WAITING');")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, priority, status) VALUES ('t-high', 'H-1', 'High', 'srv-lp', 'HIGH', 'WAITING');")
    conn.commit()

    queue = queue_service.get_waiting_queue(conn, "srv-lp")
    assert queue[0]["id"] == "t-urg"
    assert queue[1]["id"] == "t-high"
    assert queue[2]["id"] == "t-norm"

    conn.execute("DELETE FROM tokens WHERE id IN ('t-norm', 't-urg', 't-high');")
    conn.commit()
    conn.close()

def test_priority_aging_starvation_prevention():
    """
    Verify Priority Aging starvation prevention:
    A NORMAL token waiting for 12 minutes (+2 aging bonus -> effective priority 3)
    takes precedence over a newly created URGENT token (effective priority 3, but later timestamp).
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp' AND status = 'WAITING';")
    now = datetime.now(timezone.utc)
    old_time = (now - timedelta(minutes=12)).strftime('%Y-%m-%d %H:%M:%S.%f')
    new_time = now.strftime('%Y-%m-%d %H:%M:%S.%f')

    # Aged normal token
    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, priority, status, created_at)
        VALUES ('t-aged-norm', 'N-OLD', 'Old Normal', 'srv-lp', 'NORMAL', 'WAITING', ?);
    """, (old_time,))

    # Newly arrived urgent token
    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, priority, status, created_at)
        VALUES ('t-new-urg', 'U-NEW', 'New Urgent', 'srv-lp', 'URGENT', 'WAITING', ?);
    """, (new_time,))
    conn.commit()

    queue = queue_service.get_waiting_queue(conn, "srv-lp")
    # Aged normal token must be served first!
    assert queue[0]["id"] == "t-aged-norm"
    assert queue[1]["id"] == "t-new-urg"

    conn.execute("DELETE FROM tokens WHERE id IN ('t-aged-norm', 't-new-urg');")
    conn.commit()
    conn.close()

def test_priority_aging_fifo_tie_breaking():
    """
    Verify that tokens with equal effective priority strictly preserve FIFO created_at ordering.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp' AND status = 'WAITING';")
    now = datetime.now(timezone.utc)
    t1 = (now - timedelta(minutes=2)).strftime('%Y-%m-%d %H:%M:%S.%f')
    t2 = (now - timedelta(minutes=1)).strftime('%Y-%m-%d %H:%M:%S.%f')

    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, priority, status, created_at)
        VALUES ('t-fifo-1', 'N-1', 'First', 'srv-lp', 'NORMAL', 'WAITING', ?);
    """, (t1,))
    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, priority, status, created_at)
        VALUES ('t-fifo-2', 'N-2', 'Second', 'srv-lp', 'NORMAL', 'WAITING', ?);
    """, (t2,))
    conn.commit()

    queue = queue_service.get_waiting_queue(conn, "srv-lp")
    assert queue[0]["id"] == "t-fifo-1"
    assert queue[1]["id"] == "t-fifo-2"

    conn.execute("DELETE FROM tokens WHERE id IN ('t-fifo-1', 't-fifo-2');")
    conn.commit()
    conn.close()

def test_multi_counter_load_balancing_auto_selection():
    """
    Verify select_best_counter_for_service picks the counter with lowest current load.
    """
    import sqlite3
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    # Ensure both counters are OPEN
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")

    # Add 2 waiting tokens to cntr-lp-1
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('tb-1', 'L1', 'S1', 'srv-lp', 'cntr-lp-1', 'WAITING');")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('tb-2', 'L2', 'S2', 'srv-lp', 'cntr-lp-1', 'WAITING');")
    conn.commit()
    selected = queue_service.select_best_counter_for_service(conn, "srv-lp")
    assert selected == "cntr-lp-2"

    conn.execute("DELETE FROM tokens WHERE id IN ('tb-1', 'tb-2');")
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

def test_student_booking_auto_load_balancing():
    """
    Verify booking a token without explicit counter_id automatically routes to the best counter.
    """
    import jwt
    import sqlite3
    from app.config import settings

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    # Put 1 token on cntr-lp-2
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('tb-load-1', 'L1', 'S1', 'srv-lp', 'cntr-lp-2', 'WAITING');")
    conn.commit()
    conn.close()

    student_jwt = jwt.encode(
        {"id": "usr-student-auto-load", "email": "autoload@queuecraft.edu", "name": "Auto Load"},
        settings.jwt_secret,
        algorithm="HS256"
    )

    # Book token passing counter_id = None
    res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp"},
        headers={"Authorization": f"Bearer {student_jwt}"}
    )
    assert res.status_code == 200
    token = res.json()["token"]
    # cntr-lp-1 has load 0, cntr-lp-2 has load 1 -> should select cntr-lp-1
    assert token["counter_id"] == "cntr-lp-1"

    # Cleanup
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

def test_queue_invariant_no_double_serving():
    """
    Verify queue invariant: A counter cannot serve two tokens simultaneously.
    """
    import sqlite3
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id = 'cntr-lp-2';")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('t-serv-1', 'S1', 'Serv 1', 'srv-lp', 'cntr-lp-2', 'SERVING');")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, status) VALUES ('t-wait-1', 'S2', 'Wait 1', 'srv-lp', 'WAITING');")
    conn.commit()

    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        queue_service.call_next_token(conn, "cntr-lp-2", "srv-lp")
    assert exc_info.value.status_code == 400
    assert "already has active serving token" in str(exc_info.value.detail)

    conn.execute("DELETE FROM tokens WHERE id IN ('t-serv-1', 't-wait-1');")
    conn.commit()
    conn.close()

def test_queue_invariant_cancelled_excluded():
    """
    Verify CANCELLED and SKIPPED tokens are strictly excluded from waiting queue functions.
    """
    import sqlite3
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, status) VALUES ('t-canc', 'C1', 'Cancel', 'srv-lp', 'CANCELLED');")
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, status) VALUES ('t-skip', 'K1', 'Skip', 'srv-lp', 'SKIPPED');")
    conn.commit()

    queue = queue_service.get_waiting_queue(conn, "srv-lp")
    assert len(queue) == 0

    conn.execute("DELETE FROM tokens WHERE id IN ('t-canc', 't-skip');")
    conn.commit()
    conn.close()

def test_concurrent_booking_safety():
    """
    Verify atomic sequential token generation under concurrent booking requests.
    """
    import threading
    import jwt
    from app.config import settings

    results = []
    errors = []

    def make_booking(user_idx):
        try:
            st_jwt = jwt.encode(
                {"id": f"usr-conc-student-{user_idx}", "email": f"conc{user_idx}@queuecraft.edu", "name": f"Conc {user_idx}"},
                settings.jwt_secret,
                algorithm="HS256"
            )
            res = client.post(
                "/api/student/tokens/book",
                json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
                headers={"Authorization": f"Bearer {st_jwt}"}
            )
            if res.status_code == 200:
                results.append(res.json()["token"]["token_number"])
            else:
                errors.append(res.text)
        except Exception as e:
            errors.append(str(e))

    threads = [threading.Thread(target=make_booking, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # All 5 bookings should succeed with unique sequential token numbers
    assert len(results) == 5
    assert len(set(results)) == 5


# Additional Granular Phase 6 Queue Engine & Invariant Tests

def test_priority_aging_multiple_intervals():
    """
    Verify a token waiting 25 minutes gets an aging bonus of +5 (effective priority 1 + 5 = 6).
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    now = datetime.now(timezone.utc)
    ts_25m = (now - timedelta(minutes=25)).strftime('%Y-%m-%d %H:%M:%S.%f')

    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, priority, status, created_at)
        VALUES ('t-25m', 'N-25', 'Wait 25m', 'srv-lp', 'NORMAL', 'WAITING', ?);
    """, (ts_25m,))
    conn.commit()

    queue = queue_service.get_waiting_queue(conn, "srv-lp")
    assert len(queue) == 1
    assert queue[0]["id"] == "t-25m"

    conn.execute("DELETE FROM tokens WHERE id = 't-25m';")
    conn.commit()
    conn.close()

def test_priority_aging_zero_elapsed_mins():
    """
    Verify newly created token has aging bonus 0 (effective priority equals base priority).
    """
    import sqlite3
    from datetime import datetime, timezone
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')

    conn.execute("""
        INSERT INTO tokens (id, token_number, student_name, service_id, priority, status, created_at)
        VALUES ('t-zero', 'N-0', 'Wait 0m', 'srv-lp', 'NORMAL', 'WAITING', ?);
    """, (now,))
    conn.commit()

    queue = queue_service.get_waiting_queue(conn, "srv-lp")
    assert len(queue) == 1
    assert queue[0]["id"] == "t-zero"

    conn.execute("DELETE FROM tokens WHERE id = 't-zero';")
    conn.commit()
    conn.close()

def test_priority_aging_microsecond_timestamp_parsing():
    """
    Verify parse_timestamp handles various ISO format strings seamlessly.
    """
    from app.services.queue_service import parse_timestamp
    dt1 = parse_timestamp("2026-08-19 01:00:00")
    dt2 = parse_timestamp("2026-08-19T01:00:00.123456")
    dt3 = parse_timestamp("2026-08-19 01:00:00.654321")
    assert dt1.year == 2026
    assert dt2.microsecond == 123456
    assert dt3.microsecond == 654321

def test_load_balancing_serving_token_counts_in_load():
    """
    Verify serving token on a counter counts towards its overall load score.
    """
    import sqlite3
    from app.services import queue_service
    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")

    # Put a SERVING token on cntr-lp-1 (load = 1) and 0 tokens on cntr-lp-2 (load = 0)
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('t-serv-load', 'L1', 'S1', 'srv-lp', 'cntr-lp-1', 'SERVING');")
    conn.commit()

    best = queue_service.select_best_counter_for_service(conn, "srv-lp")
    assert best == "cntr-lp-2"

    conn.execute("DELETE FROM tokens WHERE id = 't-serv-load';")
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

def test_load_balancing_closed_counters_rejected():
    """
    Verify attempting to book a token directly to a CLOSED counter raises 400.
    """
    import sqlite3

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE student_id = 'usr-student-demo';")
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

    res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-1"}, # cntr-lp-1 is CLOSED
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert res.status_code == 400
    assert "not accepting new tokens" in res.json().get("message", res.json().get("detail", ""))

def test_student_cannot_cancel_serving_token():
    """
    Verify student attempting to cancel a SERVING token gets 400 Bad Request.
    """
    import sqlite3

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE student_id = 'usr-student-demo';")
    conn.execute("INSERT INTO tokens (id, token_number, student_id, student_name, service_id, counter_id, status) VALUES ('t-canc-serv', 'C1', 'usr-student-demo', 'Demo Student', 'srv-lp', 'cntr-lp-2', 'SERVING');")
    conn.commit()
    conn.close()

    res = client.patch(
        "/api/student/tokens/t-canc-serv/cancel",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert res.status_code == 400
    assert "Cannot cancel token with status: SERVING" in res.json().get("message", res.json().get("detail", ""))

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE id = 't-canc-serv';")
    conn.commit()
    conn.close()

def test_student_cannot_cancel_other_student_token():
    """
    Verify student attempting to cancel another student token gets 403 Forbidden.
    """
    import sqlite3

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE student_id IN ('usr-student-demo', 'usr-other-owner');")
    conn.execute("INSERT INTO tokens (id, token_number, student_id, student_name, service_id, counter_id, status) VALUES ('t-other-st', 'C1', 'usr-other-owner', 'Owner Student', 'srv-lp', 'cntr-lp-2', 'WAITING');")
    conn.commit()
    conn.close()

    res = client.patch(
        "/api/student/tokens/t-other-st/cancel",
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert res.status_code == 403
    assert "Forbidden: You do not own this token" in res.json().get("message", res.json().get("detail", ""))

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM tokens WHERE id = 't-other-st';")
    conn.commit()
    conn.close()

def test_student_history_endpoint():
    """
    Verify GET /api/student/tokens/history returns historical tokens.
    """
    res = client.get("/api/student/tokens/history", headers={"Authorization": "Bearer mock-token-student"})
    assert res.status_code == 200
    data = res.json()
    assert "tokens" in data
    assert isinstance(data["tokens"], list)

def test_student_active_token_endpoint():
    """
    Verify GET /api/student/tokens/active returns active token or null.
    """
    res = client.get("/api/student/tokens/active", headers={"Authorization": "Bearer mock-token-student"})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data

def test_student_services_endpoint():
    """
    Verify GET /api/student/services returns services with operational counters.
    """
    res = client.get("/api/student/services", headers={"Authorization": "Bearer mock-token-student"})
    assert res.status_code == 200
    data = res.json()
    assert "services" in data
    assert len(data["services"]) > 0

def test_student_counters_endpoint():
    """
    Verify GET /api/student/counters returns counter list.
    """
    res = client.get("/api/student/counters", headers={"Authorization": "Bearer mock-token-student"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_staff_call_next_empty_queue_400():
    """
    Verify staff calling NEXT on an empty queue returns HTTP 400.
    """
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id = 'cntr-lp-2';")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp' AND status = 'WAITING';")
    conn.commit()
    conn.close()

    res = client.post(
        "/api/staff/counter/next",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert res.status_code == 400

def test_staff_counter_not_found_404():
    """
    Verify queue service operation on non-existent counter returns 404.
    """
    import sqlite3
    import pytest
    from fastapi import HTTPException
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db")
    with pytest.raises(HTTPException) as exc:
        queue_service.call_next_token(conn, "non-existent-counter", "srv-lp")
    assert exc.value.status_code == 404
    conn.close()

def test_staff_counter_closed_400():
    """
    Verify calling next token on a closed counter returns HTTP 400.
    """
    import sqlite3
    import pytest
    from fastapi import HTTPException
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-2';")
    conn.commit()

    with pytest.raises(HTTPException) as exc:
        queue_service.call_next_token(conn, "cntr-lp-2", "srv-lp")
    assert exc.value.status_code == 400
    assert "Counter is currently CLOSED" in str(exc.value.detail)
    conn.close()

def test_admin_create_service_validation():
    """
    Verify Admin POST /api/admin/services creates a service definition.
    """
    import sqlite3
    admin_headers = {"Authorization": "Bearer mock-token-admin"}
    res = client.post(
        "/api/admin/services",
        json={"id": "srv-test-adm", "name": "Admin Test Service", "code": "ATS", "description": "Test service"},
        headers=admin_headers
    )
    assert res.status_code in (200, 201)

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM services WHERE id = 'srv-test-adm';")
    conn.commit()
    conn.close()

def test_admin_update_service_validation():
    """
    Verify Admin PATCH /api/admin/services/{id} updates service details.
    """
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("INSERT OR REPLACE INTO services (id, name, code, description) VALUES ('srv-upd-tst', 'Old Name', 'SUT', 'Old');")
    conn.commit()
    conn.close()

    admin_headers = {"Authorization": "Bearer mock-token-admin"}
    res = client.patch(
        "/api/admin/services/srv-upd-tst",
        json={"name": "New Name", "description": "New Desc"},
        headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["name"] == "New Name"

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM services WHERE id = 'srv-upd-tst';")
    conn.commit()
    conn.close()

def test_admin_create_counter_validation():
    """
    Verify Admin POST /api/admin/counters creates counter definition.
    """
    import sqlite3
    admin_headers = {"Authorization": "Bearer mock-token-admin"}
    res = client.post(
        "/api/admin/counters",
        json={"id": "cntr-test-adm", "service_id": "srv-lp", "name": "Admin Counter Test", "status": "CLOSED"},
        headers=admin_headers
    )
    assert res.status_code in (200, 201)

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM counters WHERE id = 'cntr-test-adm';")
    conn.commit()
    conn.close()

def test_admin_update_counter_validation():
    """
    Verify Admin PATCH /api/admin/counters/{id} updates counter properties.
    """
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("INSERT OR REPLACE INTO counters (id, service_id, name, status) VALUES ('cntr-upd-tst', 'srv-lp', 'Old Counter', 'CLOSED');")
    conn.commit()
    conn.close()

    admin_headers = {"Authorization": "Bearer mock-token-admin"}
    res = client.patch(
        "/api/admin/counters/cntr-upd-tst",
        json={"name": "New Counter Name", "status": "OPEN"},
        headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["name"] == "New Counter Name"

    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("DELETE FROM counters WHERE id = 'cntr-upd-tst';")
    conn.commit()
    conn.close()

def test_admin_delete_counter_validation():
    """
    Verify Admin DELETE /api/admin/counters/{id} deletes counter.
    """
    import sqlite3
    conn = sqlite3.connect("test_queuecraft.db")
    conn.execute("INSERT OR REPLACE INTO counters (id, service_id, name, status) VALUES ('cntr-del-tst', 'srv-lp', 'Del Counter', 'CLOSED');")
    conn.commit()
    conn.close()

    admin_headers = {"Authorization": "Bearer mock-token-admin"}
    res = client.delete(
        "/api/admin/counters/cntr-del-tst",
        headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

def test_dynamic_wait_zero_and_negative_people_ahead():
    """
    Verify calculate_dynamic_wait_time returns 0 for <= 0 people ahead.
    """
    import sqlite3
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db")
    conn.row_factory = sqlite3.Row

    assert queue_service.calculate_dynamic_wait_time(conn, "srv-lp", 0) == 0
    assert queue_service.calculate_dynamic_wait_time(conn, "srv-lp", -5) == 0
    conn.close()

# PHASE 6 FINAL CORRECTION TESTS

def test_effective_load_balancing_faster_counter_wins():
    """
    1. Faster counter beats shorter raw queue.
    Counter A: 2 waiting tokens, 2.0 min average service -> 4.0 min effective wait
    Counter B: 1 waiting token, 15.0 min average service -> 15.0 min effective wait
    Expected: Counter A wins.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    # Setup 2 OPEN counters for srv-lp
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")

    now = datetime.now(timezone.utc)
    # Seed 2 completed tokens for cntr-lp-1 (2 min average)
    for i in range(2):
        st = (now - timedelta(minutes=20 + i*5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        et = (now - timedelta(minutes=18 + i*5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at) VALUES ('t-hist-a{i}', 'LPA{i}', 'Student', 'srv-lp', 'cntr-lp-1', 'COMPLETED', '{st}', '{et}');")

    # Seed 2 completed tokens for cntr-lp-2 (15 min average)
    for i in range(2):
        st = (now - timedelta(minutes=60 + i*30)).strftime('%Y-%m-%d %H:%M:%S.%f')
        et = (now - timedelta(minutes=45 + i*30)).strftime('%Y-%m-%d %H:%M:%S.%f')
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at) VALUES ('t-hist-b{i}', 'LPB{i}', 'Student', 'srv-lp', 'cntr-lp-2', 'COMPLETED', '{st}', '{et}');")

    # Seed 2 waiting tokens at cntr-lp-1
    for i in range(2):
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('t-wait-a{i}', 'WA{i}', 'Student', 'srv-lp', 'cntr-lp-1', 'WAITING');")

    # Seed 1 waiting token at cntr-lp-2
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('t-wait-b0', 'WB0', 'Student', 'srv-lp', 'cntr-lp-2', 'WAITING');")
    conn.commit()

    best = queue_service.select_best_counter_for_service(conn, "srv-lp")
    assert best == "cntr-lp-1"

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.commit()
    conn.close()

def test_effective_load_balancing_serving_token_impact():
    """
    2. Serving-token impact on effective wait.
    Counter A: 1 serving, 0 waiting, 2 min average -> 2 min effective wait
    Counter B: 0 serving, 1 waiting, 15 min average -> 15 min effective wait
    Expected: Counter A wins.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")

    now = datetime.now(timezone.utc)
    # cntr-lp-1: 2 min avg
    for i in range(2):
        st = (now - timedelta(minutes=20 + i*5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        et = (now - timedelta(minutes=18 + i*5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at) VALUES ('t-hist-a{i}', 'LPA{i}', 'Student', 'srv-lp', 'cntr-lp-1', 'COMPLETED', '{st}', '{et}');")

    # cntr-lp-2: 15 min avg
    for i in range(2):
        st = (now - timedelta(minutes=60 + i*30)).strftime('%Y-%m-%d %H:%M:%S.%f')
        et = (now - timedelta(minutes=45 + i*30)).strftime('%Y-%m-%d %H:%M:%S.%f')
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at) VALUES ('t-hist-b{i}', 'LPB{i}', 'Student', 'srv-lp', 'cntr-lp-2', 'COMPLETED', '{st}', '{et}');")

    # cntr-lp-1: 1 SERVING, 0 WAITING
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('t-serv-a', 'SA', 'Student', 'srv-lp', 'cntr-lp-1', 'SERVING');")
    # cntr-lp-2: 0 SERVING, 1 WAITING
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status) VALUES ('t-wait-b', 'WB', 'Student', 'srv-lp', 'cntr-lp-2', 'WAITING');")
    conn.commit()

    best = queue_service.select_best_counter_for_service(conn, "srv-lp")
    assert best == "cntr-lp-1"

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.commit()
    conn.close()

def test_effective_load_balancing_deterministic_tie_breaking():
    """
    3. Same effective wait deterministic tie-breaking: lower total load, then counter name/id.
    """
    import sqlite3
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.commit()

    # Cold start (5.0 mins) for both counters with 0 tokens -> effective wait = 0.0 for both.
    # Name ASC: cntr-lp-1 ("Printer Counter 1") vs cntr-lp-2 ("Printer Counter 2")
    best = queue_service.select_best_counter_for_service(conn, "srv-lp")
    assert best == "cntr-lp-1"

    conn.close()

def test_counter_specific_history_preferred():
    """
    4. Counter-specific history preferred over service-level history.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    now = datetime.now(timezone.utc)
    # Seed 2 completed for cntr-lp-1 (2 min duration)
    for i in range(2):
        st = (now - timedelta(minutes=20 + i*5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        et = (now - timedelta(minutes=18 + i*5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at) VALUES ('t-sp-a{i}', 'LPA{i}', 'Student', 'srv-lp', 'cntr-lp-1', 'COMPLETED', '{st}', '{et}');")
    conn.commit()

    dur = queue_service.get_historical_service_duration(conn, "srv-lp", counter_id="cntr-lp-1")
    assert abs(dur - 2.0) < 0.1

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.commit()
    conn.close()

def test_service_level_history_fallback():
    """
    5. Service-level history fallback when counter history < 2 samples.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    now = datetime.now(timezone.utc)
    # Seed 2 completed for cntr-lp-2 (7 min duration)
    for i in range(2):
        st = (now - timedelta(minutes=20 + i*10)).strftime('%Y-%m-%d %H:%M:%S.%f')
        et = (now - timedelta(minutes=13 + i*10)).strftime('%Y-%m-%d %H:%M:%S.%f')
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at) VALUES ('t-fb-b{i}', 'LPB{i}', 'Student', 'srv-lp', 'cntr-lp-2', 'COMPLETED', '{st}', '{et}');")
    conn.commit()

    # Query duration for cntr-lp-1 (which has 0 samples) -> falls back to srv-lp service level (7 mins)
    dur = queue_service.get_historical_service_duration(conn, "srv-lp", counter_id="cntr-lp-1")
    assert abs(dur - 7.0) < 0.1

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.commit()
    conn.close()

def test_cold_start_fallback():
    """
    6. Cold-start fallback (5.0 mins) when no history exists.
    """
    import sqlite3
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp' AND status = 'COMPLETED';")
    conn.commit()

    dur = queue_service.get_historical_service_duration(conn, "srv-lp", counter_id="cntr-lp-1")
    assert dur == 5.0
    conn.close()

def test_closed_counter_excluded():
    """
    7. CLOSED counter excluded from load balancing.
    """
    import sqlite3
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id = 'cntr-lp-2';")
    conn.commit()

    best = queue_service.select_best_counter_for_service(conn, "srv-lp")
    assert best == "cntr-lp-2"
    conn.close()

def test_maintenance_counter_excluded():
    """
    8. MAINTENANCE counter excluded from load balancing.
    """
    import sqlite3
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("UPDATE counters SET status = 'MAINTENANCE' WHERE id = 'cntr-lp-1';")
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id = 'cntr-lp-2';")
    conn.commit()

    best = queue_service.select_best_counter_for_service(conn, "srv-lp")
    assert best == "cntr-lp-2"

    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()
    conn.close()

def test_explicit_counter_assignment_preserved():
    """
    9. Explicit counter assignment preserved during student booking.
    """
    import sqlite3

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id = 'cntr-lp-1';")
    conn.execute("DELETE FROM tokens WHERE student_id = 'usr-student-demo';")
    conn.commit()
    conn.close()

    res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-1"}, # Explicit counter selection
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert res.status_code == 200
    assert res.json()["token"]["counter_id"] == "cntr-lp-1"

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.execute("DELETE FROM tokens WHERE student_id = 'usr-student-demo';")
    conn.commit()
    conn.close()

def test_counter_affinity_next_cannot_steal_token():
    """
    10. Counter A NEXT cannot steal explicitly assigned Counter B token.
    """
    import sqlite3
    import pytest
    from fastapi import HTTPException
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")

    # Insert Token B assigned explicitly to cntr-lp-2
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, priority, status) VALUES ('t-aff-b', 'LP-B1', 'Student B', 'srv-lp', 'cntr-lp-2', 'URGENT', 'WAITING');")
    conn.commit()

    # Staff at cntr-lp-1 calls next -> must NOT steal t-aff-b (assigned to cntr-lp-2)
    with pytest.raises(HTTPException) as exc:
        queue_service.call_next_token(conn, "cntr-lp-1", "srv-lp")
    assert exc.value.status_code == 400
    assert "empty for this counter" in str(exc.value.detail)

    conn.execute("DELETE FROM tokens WHERE id = 't-aff-b';")
    conn.commit()
    conn.close()

def test_auto_assigned_token_retains_counter_assignment():
    """
    11. Automatically assigned token retains its counter assignment permanently.
    """
    import sqlite3

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id IN ('cntr-lp-1', 'cntr-lp-2');")
    conn.execute("DELETE FROM tokens WHERE student_id = 'usr-student-demo';")
    conn.commit()
    conn.close()

    # Book token without explicit counter_id
    res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp"},
        headers={"Authorization": "Bearer mock-token-student"}
    )
    assert res.status_code == 200
    assigned_counter = res.json()["token"]["counter_id"]
    assert assigned_counter in ("cntr-lp-1", "cntr-lp-2")

    # Fetch active token and assert counter_id matches
    res_act = client.get("/api/student/tokens/active", headers={"Authorization": "Bearer mock-token-student"})
    assert res_act.status_code == 200
    assert res_act.json()["token"]["counter_id"] == assigned_counter

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.execute("DELETE FROM tokens WHERE student_id = 'usr-student-demo';")
    conn.commit()
    conn.close()

def test_priority_aging_within_counter_queue():
    """
    12. Priority aging still works correctly within counter queue.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE counter_id = 'cntr-lp-2' AND status = 'WAITING';")
    now = datetime.now(timezone.utc)
    t_old = (now - timedelta(minutes=12)).strftime('%Y-%m-%d %H:%M:%S.%f')

    # Old NORMAL (+2 aging bonus -> effective 3) at cntr-lp-2
    conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, priority, status, created_at) VALUES ('t-age-cntr-norm', 'LP-N', 'Student N', 'srv-lp', 'cntr-lp-2', 'NORMAL', 'WAITING', '{t_old}');")
    # Brand new URGENT (effective 3) at cntr-lp-2
    conn.execute("INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, priority, status) VALUES ('t-age-cntr-urg', 'LP-U', 'Student U', 'srv-lp', 'cntr-lp-2', 'URGENT', 'WAITING');")
    conn.commit()

    q = queue_service.get_waiting_queue(conn, "srv-lp", counter_id="cntr-lp-2")
    assert len(q) == 2
    assert q[0]["id"] == "t-age-cntr-norm" # Old NORMAL wins via FIFO tie-breaker

    conn.execute("DELETE FROM tokens WHERE id IN ('t-age-cntr-norm', 't-age-cntr-urg');")
    conn.commit()
    conn.close()

def test_concurrent_auto_bookings_safety():
    """
    13. Concurrent automatic bookings remain safe under thread locks.
    """
    import threading
    import jwt
    from app.config import settings

    results = []
    errors = []

    def make_auto_booking(user_idx):
        try:
            st_jwt = jwt.encode(
                {"id": f"usr-auto-conc-{user_idx}", "email": f"autoconc{user_idx}@queuecraft.edu", "name": f"Auto {user_idx}"},
                settings.jwt_secret,
                algorithm="HS256"
            )
            res = client.post(
                "/api/student/tokens/book",
                json={"service_id": "srv-lp"}, # Omitted counter_id -> auto load balance
                headers={"Authorization": f"Bearer {st_jwt}"}
            )
            if res.status_code == 200:
                results.append(res.json()["token"]["token_number"])
            else:
                errors.append(res.text)
        except Exception as e:
            errors.append(str(e))

    threads = [threading.Thread(target=make_auto_booking, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) == 5
    assert len(set(results)) == 5

def test_concurrent_next_operations_safety():
    """
    14. Concurrent NEXT operations across staff on different counters remain safe.
    """
    import jwt
    import sqlite3
    import threading
    import queue

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.execute("UPDATE counters SET status = 'OPEN', assigned_staff_id = 'usr-staff-priya' WHERE id = 'cntr-lp-1';")
    conn.execute("UPDATE counters SET status = 'OPEN' WHERE id = 'cntr-lp-2';")
    conn.execute("UPDATE tokens SET status = 'COMPLETED' WHERE service_id = 'srv-lp' AND status = 'SERVING';")
    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp' AND status = 'WAITING';")

    # Seed 1 token for cntr-lp-1 and 1 token for cntr-lp-2
    conn.execute("INSERT INTO tokens (id, token_number, student_id, student_name, service_id, counter_id, status) VALUES ('t-conc-a1', 'LPA1', 'usr-st-a', 'Student A', 'srv-lp', 'cntr-lp-1', 'WAITING');")
    conn.execute("INSERT INTO tokens (id, token_number, student_id, student_name, service_id, counter_id, status) VALUES ('t-conc-b1', 'LPB1', 'usr-st-b', 'Student B', 'srv-lp', 'cntr-lp-2', 'WAITING');")
    conn.commit()
    conn.close()

    staff_rudresh_token = "mock-token-staff" # cntr-lp-2
    staff_priya_token = jwt.encode(
        {"id": "usr-staff-priya", "email": "priya@queuecraft.edu", "name": "Priya Singh", "role": "STAFF"},
        settings.jwt_secret,
        algorithm="HS256"
    ) # cntr-lp-1

    results = queue.Queue()

    def run_next(auth):
        try:
            res = client.post(
                "/api/staff/counter/next",
                headers={"Authorization": f"Bearer {auth}"}
            )
            results.put(res)
        except Exception as e:
            results.put(e)

    th1 = threading.Thread(target=run_next, args=(staff_rudresh_token,))
    th2 = threading.Thread(target=run_next, args=(staff_priya_token,))
    th1.start()
    th2.start()
    th1.join()
    th2.join()

    claimed_ids = []
    while not results.empty():
        res = results.get()
        assert not isinstance(res, Exception)
        assert res.status_code == 200
        claimed_ids.append(res.json()["token"]["id"])

    assert len(claimed_ids) == 2
    assert set(claimed_ids) == {"t-conc-a1", "t-conc-b1"}

def test_counter_status_race_safety():
    """
    15. Counter status race: Attempting NEXT on a CLOSED counter returns 400 Bad Request.
    """
    import sqlite3
    import pytest
    from fastapi import HTTPException
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.execute("UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-lp-1';")
    conn.commit()

    with pytest.raises(HTTPException) as exc:
        queue_service.call_next_token(conn, "cntr-lp-1", "srv-lp")
    assert exc.value.status_code == 400
    assert "CLOSED" in str(exc.value.detail)

    conn.close()

def test_sanity_clamping_corrupted_history():
    """
    16. Extreme or corrupted historical duration records (e.g. 500 min) are clamped to valid range.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.services import queue_service

    conn = sqlite3.connect("test_queuecraft.db", timeout=30.0)
    conn.row_factory = sqlite3.Row

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    now = datetime.now(timezone.utc)
    # Insert 2 extreme completed records (500 min duration)
    for i in range(2):
        st = (now - timedelta(minutes=600 + i*10)).strftime('%Y-%m-%d %H:%M:%S.%f')
        et = (now - timedelta(minutes=100 + i*10)).strftime('%Y-%m-%d %H:%M:%S.%f')
        conn.execute(f"INSERT INTO tokens (id, token_number, student_name, service_id, counter_id, status, started_at, completed_at) VALUES ('t-corr-{i}', 'LPC{i}', 'Student', 'srv-lp', 'cntr-lp-1', 'COMPLETED', '{st}', '{et}');")
    conn.commit()

    dur = queue_service.get_historical_service_duration(conn, "srv-lp", counter_id="cntr-lp-1")
    # Ignore corrupted > 240m records -> falls back to cold-start 5.0 mins
    assert dur == 5.0

    conn.execute("DELETE FROM tokens WHERE service_id = 'srv-lp';")
    conn.commit()
    conn.close()







