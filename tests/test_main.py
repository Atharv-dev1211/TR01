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

