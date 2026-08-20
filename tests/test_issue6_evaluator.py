import os
import time
import sqlite3
import jwt
import threading
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

# Force settings for the test environment
settings.mock_auth = True
settings.db_path = "test_queuecraft_eval6.db"

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_eval_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    settings.db_path = "test_queuecraft_eval6.db"
    from app.database import initialize_schema, seed_database
    if os.path.exists("test_queuecraft_eval6.db"):
        try:
            os.remove("test_queuecraft_eval6.db")
        except Exception:
            pass
    initialize_schema()
    seed_database()
    yield
    settings.db_path = "test_queuecraft.db"
    if os.path.exists("test_queuecraft_eval6.db"):
        try:
            os.remove("test_queuecraft_eval6.db")
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

def insert_waiting_token(token_id: str, token_number: str, student_id: str, student_name: str, created_at_str: str, priority="NORMAL"):
    """Helper to insert token record directly into DB."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (
            id, token_number, student_id, student_name, student_email, service_id, counter_id,
            priority, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'srv-lp', 'cntr-lp-2', ?, 'WAITING', ?);
    """, (token_id, token_number, student_id, student_name, f"{student_id}@queuecraft.edu", priority, created_at_str))
    conn.commit()
    conn.close()


# ==============================================================================
# ISSUE #6: REAL-TIME QUEUE UPDATES AFTER CANCELLATION
# ==============================================================================

def test_m6a_cancellation_recalculates_queue():
    """
    M6-A: Cancellation Recalculates Waiting Queue.

    Verifies:
    1. When a waiting token (B) is cancelled, it transitions to status CANCELLED.
    2. The cancelled token is removed from the active waiting queue.
    3. All subsequent tokens (C, D) have their queue positions and people_ahead counts
       dynamically recalculated (shifted up).
    4. Repeated cancellation or unauthorized cancellation does not corrupt queue state.
    """
    clean_all_tokens()

    # 1. Insert 4 waiting tokens in sequence: A, B, C, D
    insert_waiting_token("tkn-a", "LP-001", "usr-student-a", "Student A", "2026-08-20 10:00:00.000")
    insert_waiting_token("tkn-b", "LP-002", "usr-student-b", "Student B", "2026-08-20 10:01:00.000")
    insert_waiting_token("tkn-c", "LP-003", "usr-student-c", "Student C", "2026-08-20 10:02:00.000")
    insert_waiting_token("tkn-d", "LP-004", "usr-student-d", "Student D", "2026-08-20 10:03:00.000")

    # 2. Check initial waiting queue positions
    queue_res = client.get("/api/staff/counter/queue", headers={"Authorization": "Bearer mock-token-staff"})
    assert queue_res.status_code == 200
    initial_queue = queue_res.json()
    assert len(initial_queue) == 4
    assert [t["id"] for t in initial_queue] == ["tkn-a", "tkn-b", "tkn-c", "tkn-d"]

    # 3. Student B cancels their token
    b_jwt = generate_student_jwt("usr-student-b")
    cancel_res = client.post(
        "/api/student/tokens/tkn-b/cancel",
        headers={"Authorization": f"Bearer {b_jwt}"}
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["success"] is True

    # 4. Verify updated waiting queue from staff API
    updated_queue_res = client.get("/api/staff/counter/queue", headers={"Authorization": "Bearer mock-token-staff"})
    assert updated_queue_res.status_code == 200
    updated_queue = updated_queue_res.json()

    assert len(updated_queue) == 3
    assert "tkn-b" not in [t["id"] for t in updated_queue], "Cancelled token still present in waiting queue."
    assert [t["id"] for t in updated_queue] == ["tkn-a", "tkn-c", "tkn-d"]

    # 5. Check real-time position details for remaining students
    # Student A (Position 1, 0 ahead)
    a_jwt = generate_student_jwt("usr-student-a")
    a_res = client.get("/api/student/tokens/active", headers={"Authorization": f"Bearer {a_jwt}"})
    assert a_res.status_code == 200
    assert a_res.json()["token"]["people_ahead"] == 0

    # Student C (Shifted to Position 2, 1 ahead)
    c_jwt = generate_student_jwt("usr-student-c")
    c_res = client.get("/api/student/tokens/active", headers={"Authorization": f"Bearer {c_jwt}"})
    assert c_res.status_code == 200
    assert c_res.json()["token"]["people_ahead"] == 1, f"Student C people_ahead expected 1 after B cancelled, got {c_res.json()['token']['people_ahead']}"

    # Student D (Shifted to Position 3, 2 ahead)
    d_jwt = generate_student_jwt("usr-student-d")
    d_res = client.get("/api/student/tokens/active", headers={"Authorization": f"Bearer {d_jwt}"})
    assert d_res.status_code == 200
    assert d_res.json()["token"]["people_ahead"] == 2, f"Student D people_ahead expected 2 after B cancelled, got {d_res.json()['token']['people_ahead']}"

    # 6. Safeguards: Attempting to cancel already cancelled token returns 400
    cancel_again_res = client.post(
        "/api/student/tokens/tkn-b/cancel",
        headers={"Authorization": f"Bearer {b_jwt}"}
    )
    assert cancel_again_res.status_code == 400

    # 7. Safeguards: Unauthorized student cannot cancel someone else's token
    impostor_jwt = generate_student_jwt("usr-student-impostor")
    unauth_cancel = client.post(
        "/api/student/tokens/tkn-c/cancel",
        headers={"Authorization": f"Bearer {impostor_jwt}"}
    )
    assert unauth_cancel.status_code == 403


@pytest.fixture(scope="module")
def run_app_server_issue6():
    """Spawns an isolated ASGI server for testing real-time socket events."""
    import uvicorn
    server_port = 5007
    server_thread = threading.Thread(
        target=lambda: uvicorn.run(app, host="127.0.0.1", port=server_port, log_level="error"),
        daemon=True
    )
    server_thread.start()
    time.sleep(0.6)  # Give server time to bind and listen
    yield f"http://127.0.0.1:{server_port}"


def test_m6b_cancellation_realtime_propagation(run_app_server_issue6):
    """
    M6-B: Real-Time Event Propagation After Cancellation.

    Verifies:
    1. An observer connected via Socket.IO receives real-time queue updates
       when a token is cancelled by another client.
    2. The update is pushed via WebSockets (not through client polling).
    3. The payload contains the correct cancellation action and target token ID.
    """
    import socketio

    clean_all_tokens()
    server_url = run_app_server_issue6

    # 1. Setup Observer Socket.IO Client
    observer_client = socketio.Client()
    received_events = []

    @observer_client.on('*')
    def catch_all_events(event_name, data):
        received_events.append((event_name, data))

    observer_client.connect(server_url, socketio_path='socket.io')
    observer_client.emit('join_service', 'srv-lp')
    observer_client.emit('join_counter', 'cntr-lp-2')
    time.sleep(0.2)

    # 2. Book a new token for Student X
    student_x_jwt = generate_student_jwt("usr-student-socket-x")
    book_res = client.post(
        "/api/student/tokens/book",
        json={"service_id": "srv-lp", "counter_id": "cntr-lp-2"},
        headers={"Authorization": f"Bearer {student_x_jwt}"}
    )
    assert book_res.status_code == 200
    token_x = book_res.json()["token"]
    time.sleep(0.2)

    # Clear create events
    received_events.clear()

    # 3. Student X cancels their token via REST API
    cancel_res = client.post(
        f"/api/student/tokens/{token_x['id']}/cancel",
        headers={"Authorization": f"Bearer {student_x_jwt}"}
    )
    assert cancel_res.status_code == 200

    # 4. Wait for real-time WebSocket push (without any manual GET polling)
    time.sleep(0.4)

    # 5. Verify received real-time socket events
    event_names = [e[0] for e in received_events]

    # Assert queue update event was dispatched to the observer
    has_queue_update = any(name in ('QUEUE_UPDATED', 'queueUpdate', 'queue_updated') for name in event_names)
    assert has_queue_update, f"Observer client did not receive any real-time queue update event. Events received: {event_names}"

    # Verify event payload structure
    cancel_events = [e[1] for e in received_events if e[0] in ('QUEUE_UPDATED', 'queueUpdate', 'queue_updated')]
    assert len(cancel_events) > 0

    last_event_payload = cancel_events[-1]
    assert last_event_payload.get("action") == "CANCEL", f"Event payload action mismatch: {last_event_payload}"
    assert last_event_payload.get("tokenId") == token_x["id"], f"Event payload tokenId mismatch: {last_event_payload}"

    observer_client.disconnect()
