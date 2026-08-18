import sqlite3
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from app.database import get_db
from app.dependencies import require_student
from app.models.schemas import ServicesListResponse, CounterDiscoveryResponse

router = APIRouter()

@router.get("/services", response_model=ServicesListResponse)
def get_student_services(
    current_user: dict = Depends(require_student),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Retrieves all available services along with their operational counters,
    including current queue lengths and estimated wait times.
    """
    try:
        cursor = db.cursor()
        
        # Get all services
        cursor.execute("SELECT id, name, code, description FROM services ORDER BY name ASC;")
        services = [dict(row) for row in cursor.fetchall()]
        
        # Get all counters
        cursor.execute("SELECT id, service_id, name, status FROM counters;")
        counters = [dict(row) for row in cursor.fetchall()]
        
        # Fetch queue sizes for counters
        cursor.execute("""
            SELECT counter_id, COUNT(*) as count 
            FROM tokens 
            WHERE status IN ('WAITING', 'HELD') AND counter_id IS NOT NULL
            GROUP BY counter_id;
        """)
        queue_sizes = {row["counter_id"]: row["count"] for row in cursor.fetchall()}
        
        # Embed counters inside their respective parent services
        services_with_counters = []
        for service in services:
            service_id = service["id"]
            service_counters = []
            
            for counter in counters:
                if counter["service_id"] == service_id:
                    q_size = queue_sizes.get(counter["id"], 0)
                    service_counters.append({
                        "id": counter["id"],
                        "service_id": counter["service_id"],
                        "name": counter["name"],
                        "status": counter["status"],
                        "queue_size": q_size,
                        "estimated_wait_time": q_size * 5
                    })
            
            services_with_counters.append({
                **service,
                "counters": service_counters
            })
            
        return {"services": services_with_counters}
        
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query error: {str(e)}"
        )

@router.get("/counters", response_model=List[CounterDiscoveryResponse])
def get_student_counters(
    current_user: dict = Depends(require_student),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Retrieves a list of all counters mapped to their parent service definitions.
    """
    try:
        cursor = db.cursor()
        cursor.execute("""
            SELECT c.id, c.name, c.service_id, c.status, s.name as service_name, s.code as service_code
            FROM counters c
            JOIN services s ON c.service_id = s.id
            ORDER BY c.name ASC;
        """)
        counters = [dict(row) for row in cursor.fetchall()]
        return counters
        
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query error: {str(e)}"
        )
