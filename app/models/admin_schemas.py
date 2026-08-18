from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

# User Admin Schemas
class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: str

class AdminUserCreate(BaseModel):
    name: str = Field(..., min_length=1)
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    role: str = Field(..., description="Role MUST be STUDENT, STAFF, or ADMIN")

class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None


# Service Admin Schemas
class ServiceResponse(BaseModel):
    id: str
    name: str
    code: str
    description: Optional[str] = ""
    created_at: str

class AdminServiceCreate(BaseModel):
    name: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)
    description: Optional[str] = ""

class AdminServiceUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None


# Counter Admin Schemas
class CounterDetailResponse(BaseModel):
    id: str
    service_id: str
    name: str
    status: str
    assigned_staff_id: Optional[str] = None
    created_at: str
    service_name: Optional[str] = None
    service_code: Optional[str] = None
    assigned_staff_name: Optional[str] = None

class AdminCounterCreate(BaseModel):
    name: str = Field(..., min_length=1)
    service_id: str = Field(..., min_length=1)
    status: Optional[str] = "CLOSED"

class AdminCounterUpdate(BaseModel):
    name: Optional[str] = None
    service_id: Optional[str] = None
    status: Optional[str] = None

class AssignStaffRequest(BaseModel):
    staffId: Optional[str] = None

class AssignStaffResponse(BaseModel):
    success: bool
    message: str
    counter_id: str
    assigned_staff_id: Optional[str] = None


# Dashboard, Live Monitor & Analytics Schemas
class AdminDashboardStatsResponse(BaseModel):
    services_count: int
    active_counters_count: int
    waiting_tokens_count: int
    currently_serving_count: int
    completed_today_count: int
    skipped_today_count: int
    cancelled_today_count: int
    avg_waiting_time_minutes: float

class LiveMonitorCounterItem(BaseModel):
    counter_id: str
    counter_name: str
    counter_status: str
    service_id: str
    service_name: str
    service_code: str
    assigned_staff: Optional[Dict[str, Any]] = None
    current_token: Optional[Dict[str, Any]] = None
    waiting_count: int

class AdminAnalyticsResponse(BaseModel):
    summary: Dict[str, Any]
    service_distribution: List[Dict[str, Any]]
    counter_activity: List[Dict[str, Any]]
    hourly_distribution: List[Dict[str, Any]]
