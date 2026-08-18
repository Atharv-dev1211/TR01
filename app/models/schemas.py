from pydantic import BaseModel, Field
from typing import List, Optional

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: str

class CounterBase(BaseModel):
    id: str
    service_id: str
    name: str
    status: str

class CounterWithWait(CounterBase):
    queue_size: int
    estimated_wait_time: int

class ServiceBase(BaseModel):
    id: str
    name: str
    code: str
    description: Optional[str] = None

class ServiceWithCounters(ServiceBase):
    counters: List[CounterWithWait]

class ServicesListResponse(BaseModel):
    services: List[ServiceWithCounters]

class CounterDiscoveryResponse(CounterBase):
    service_name: str
    service_code: str
