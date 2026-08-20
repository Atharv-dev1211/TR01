import os
import sqlite3
import datetime
from datetime import timezone
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

# Force settings for the test environment
settings.mock_auth = True
settings.db_path = "test_queuecraft_eval.db"

client = TestClient(app)

@pytest.fixture(scope="class", autouse=True)
def setup_eval_db():
    """
    Initializes and seeds the temporary test database before running tests,
    and cleans it up afterwards.
    """
    from app.database import initialize_schema, seed_database
    if os.path.exists("test_queuecraft_eval.db"):
        try:
            os.remove("test_queuecraft_eval.db")
        except Exception:
            pass
    initialize_schema()
    seed_database()
    yield
    if os.path.exists("test_queuecraft_eval.db"):
        try:
            os.remove("test_queuecraft_eval.db")
        except Exception:
            pass

def clean_all_tokens():
    """Helper to clear all tokens for isolated tests."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tokens;")
    conn.commit()
    conn.close()

def insert_token(token_id, token_number, priority, created_at_str, status="WAITING", counter_id="cntr-lp-2"):
    """Helper to insert token directly into DB to test specific configurations."""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (
            id, token_number, student_id, student_name, student_email, service_id, counter_id,
            priority, status, created_at
        ) VALUES (?, ?, 'usr-student-aarav', 'Aarav Sharma', 'aarav@queuecraft.edu', 'srv-lp', ?, ?, ?, ?);
    """, (token_id, token_number, counter_id, priority, status, created_at_str))
    conn.commit()
    conn.close()

def get_waiting_queue_via_api():
    """Helper to get waiting queue via API."""
    response = client.get(
        "/api/staff/counter/queue",
        headers={"Authorization": "Bearer mock-token-staff"}
    )
    assert response.status_code == 200
    return response.json()


# ==============================================================================
# CATEGORY 1: M4-A — FAIR SCHEDULING INVARIANTS
# ==============================================================================
class TestM4AFairSchedulingInvariants:

    def test_m4a_priority_preference(self):
        """
        Verify that a clear higher-priority token is preferred over a newer lower-priority
        token when no starvation has occurred.
        """
        clean_all_tokens()
        now = datetime.datetime.now(timezone.utc)

        # Insert normal priority token created 10 seconds ago
        normal_time = (now - datetime.timedelta(seconds=10)).strftime('%Y-%m-%d %H:%M:%S.%f')
        insert_token("tkn-normal", "LP-001", "NORMAL", normal_time)

        # Insert high priority token created just now
        high_time = now.strftime('%Y-%m-%d %H:%M:%S.%f')
        insert_token("tkn-high", "LP-002", "HIGH", high_time)

        queue = get_waiting_queue_via_api()
        assert len(queue) == 2

        # The high priority token should be preferred since it's fresh and normal token hasn't starved
        assert queue[0]["id"] == "tkn-high"
        assert queue[1]["id"] == "tkn-normal"

    def test_m4a_waiting_age_affects_eligibility(self):
        """
        Verify that waiting duration can increase a token's scheduling eligibility.
        We establish that waiting duration has a meaningful effect by setting the token age
        to a value guaranteed to exceed any reasonable time-based starvation threshold.

        Evaluator Safety Bound Rationale:
        The 2-hour duration is used as an evaluator safety/practicality limit to ensure any valid
        starvation threshold (which is expected to be much smaller) is successfully triggered in
        this test. It does NOT represent a required starvation threshold or a required aging interval
        for the production implementation.
        """
        clean_all_tokens()
        now = datetime.datetime.now(timezone.utc)

        # 1. Insert Token A (NORMAL) created 2 hours ago (safety bound to exceed starvation threshold)
        old_time = (now - datetime.timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S.%f')
        insert_token("tkn-old-normal", "LP-001", "NORMAL", old_time)

        # 2. Insert a fresh HIGH priority token at current time
        insert_token("tkn-fresh-high", "LP-002", "HIGH", now.strftime('%Y-%m-%d %H:%M:%S.%f'))

        # 3. Check queue order: tkn-old-normal should now be sorted before tkn-fresh-high
        queue = get_waiting_queue_via_api()
        assert queue[0]["id"] == "tkn-old-normal", "The older NORMAL token did not gain eligibility over the fresh HIGH token."

    def test_m4a_fifo_ordering(self):
        """
        Verify that tokens with equivalent effective scheduling priority preserve FIFO.
        """
        clean_all_tokens()
        now = datetime.datetime.now(timezone.utc)

        # Two NORMAL tokens: older first, newer second
        t1_time = (now - datetime.timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        t2_time = (now - datetime.timedelta(minutes=4)).strftime('%Y-%m-%d %H:%M:%S.%f')
        insert_token("tkn-normal-1", "LP-001", "NORMAL", t1_time)
        insert_token("tkn-normal-2", "LP-002", "NORMAL", t2_time)

        queue = get_waiting_queue_via_api()
        assert len(queue) == 2
        assert queue[0]["id"] == "tkn-normal-1"
        assert queue[1]["id"] == "tkn-normal-2"

        # Two HIGH tokens: older first, newer second
        clean_all_tokens()
        t3_time = (now - datetime.timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        t4_time = (now - datetime.timedelta(minutes=4)).strftime('%Y-%m-%d %H:%M:%S.%f')
        insert_token("tkn-high-1", "LP-003", "HIGH", t3_time)
        insert_token("tkn-high-2", "LP-004", "HIGH", t4_time)

        queue = get_waiting_queue_via_api()
        assert len(queue) == 2
        assert queue[0]["id"] == "tkn-high-1"
        assert queue[1]["id"] == "tkn-high-2"

    def test_m4a_determinism(self):
        """
        Verify that repeated evaluation of the same queue state is deterministic.
        """
        clean_all_tokens()
        now = datetime.datetime.now(timezone.utc)

        t1_time = (now - datetime.timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S.%f')
        t2_time = (now - datetime.timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S.%f')
        t3_time = now.strftime('%Y-%m-%d %H:%M:%S.%f')

        insert_token("tkn-1", "LP-001", "NORMAL", t1_time)
        insert_token("tkn-2", "LP-002", "HIGH", t2_time)
        insert_token("tkn-3", "LP-003", "URGENT", t3_time)

        order1 = [t["id"] for t in get_waiting_queue_via_api()]

        for _ in range(5):
            order2 = [t["id"] for t in get_waiting_queue_via_api()]
            assert order1 == order2


# ==============================================================================
# CATEGORY 2: M4-B — STARVATION RESISTANCE
# ==============================================================================
class TestM4BStarvationResistance:

    def test_m4b_starvation_resistance(self):
        """
        Verify that the continuous arrival of higher-priority tokens does not
        indefinitely starve an older lower-priority token.

        Evaluator Safety Bound Rationale:
        - The OLD token is created 2 hours ago once to ensure that any valid time-based
          starvation threshold (which is expected to be much smaller) is successfully triggered.
        - The scheduling opportunity loop is bounded to 15 iterations. This is an evaluator
          practicality/safety limit to prevent infinite loops in tests. It does NOT represent
          a required number of skips, a required starvation threshold, or a required aging interval.
          Any legitimate fairness algorithm must be able to schedule the older token within 15 turns.
        """
        clean_all_tokens()
        now = datetime.datetime.now(timezone.utc)

        # 1. Create older lower-priority token OLD
        old_time = (now - datetime.timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S.%f')
        insert_token("tkn-old", "LP-OLD", "NORMAL", old_time)

        # 2. Bounded scheduling loop
        max_opportunities = 15
        old_token_selected = False

        for i in range(1, max_opportunities + 1):
            # Add a newly created higher-priority token at the current time
            high_id = f"tkn-high-{i}"
            high_number = f"LP-H{i}"
            insert_token(high_id, high_number, "HIGH", now.strftime('%Y-%m-%d %H:%M:%S.%f'))

            # Invoke the scheduling/NEXT operation
            next_response = client.post(
                "/api/staff/counter/next",
                headers={"Authorization": "Bearer mock-token-staff"}
            )
            assert next_response.status_code == 200
            called_token = next_response.json()["token"]

            # Record if OLD was selected
            if called_token["id"] == "tkn-old":
                old_token_selected = True
                break
            else:
                # Complete the served high-priority token so the counter is free for the next iteration
                complete_res = client.post(
                    f"/api/staff/tokens/{called_token['id']}/complete",
                    headers={"Authorization": "Bearer mock-token-staff"}
                )
                assert complete_res.status_code == 200

        # Assert that the older token eventually receives service
        assert old_token_selected, "The older NORMAL token was starved indefinitely by arriving HIGH tokens."
