from pydantic import BaseModel
from typing import List, Optional
from app.models.schemas import TokenResponseDetail, ServiceBase, CounterBase

class CounterStatusUpdateRequest(BaseModel):
    status: str

class StaffUser(BaseModel):
    id: str
    name: str

class StaffCounter(BaseModel):
    id: str
    name: str
    status: str
    service_id: str
    service_name: str
    service_code: str

class OperationalStats(BaseModel):
    queue_length: int
    currently_serving_number: Optional[str] = None
    waiting_count: int
    held_count: int
    completed_today_count: int
    avg_service_time_minutes: float

class StaffDashboardResponse(BaseModel):
    staff: StaffUser
    counter: StaffCounter
    service: ServiceBase
    current_token: Optional[TokenResponseDetail] = None
    waiting_queue: List[TokenResponseDetail]
    stats: OperationalStats

# Action responses
class StaffActionResponse(BaseModel):
    message: str
    token: Optional[TokenResponseDetail] = None
    dashboard: StaffDashboardResponse

class CounterStatusResponse(BaseModel):
    id: str
    status: str

class CounterStatusUpdateResponse(BaseModel):
    message: str
    counter: CounterStatusResponse
    dashboard: StaffDashboardResponse
