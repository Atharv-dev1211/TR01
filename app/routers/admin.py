import sqlite3
from fastapi import APIRouter, Depends, status
from typing import List, Optional

from app.database import get_db
from app.dependencies import require_admin
from app.models.admin_schemas import (
    UserResponse,
    AdminUserCreate,
    AdminUserUpdate,
    ServiceResponse,
    AdminServiceCreate,
    AdminServiceUpdate,
    CounterDetailResponse,
    AdminCounterCreate,
    AdminCounterUpdate,
    AssignStaffRequest,
    AssignStaffResponse,
    AdminDashboardStatsResponse,
    LiveMonitorCounterItem,
    AdminAnalyticsResponse
)
from app.services import admin_service

router = APIRouter()


# 1. GET /api/admin/dashboard
@router.get("/dashboard", response_model=AdminDashboardStatsResponse)
def get_dashboard(
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.get_dashboard_stats(db)


# 2. Users CRUD (/api/admin/users)
@router.get("/users", response_model=List[UserResponse])
def get_users(
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.list_users(db)

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: AdminUserCreate,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.create_user(
        db=db,
        name=body.name,
        email=body.email,
        password=body.password,
        role=body.role
    )

@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    body: AdminUserUpdate,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.update_user(
        db=db,
        user_id=user_id,
        name=body.name,
        email=body.email,
        password=body.password,
        role=body.role
    )

@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.delete_user(
        db=db,
        user_id=user_id,
        current_admin_id=current_admin["id"]
    )


# 3. Services CRUD (/api/admin/services)
@router.get("/services", response_model=List[ServiceResponse])
def get_services(
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.list_services(db)

@router.post("/services", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    body: AdminServiceCreate,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.create_service(
        db=db,
        name=body.name,
        code=body.code,
        description=body.description
    )

@router.patch("/services/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: str,
    body: AdminServiceUpdate,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.update_service(
        db=db,
        service_id=service_id,
        name=body.name,
        code=body.code,
        description=body.description
    )

@router.delete("/services/{service_id}")
def delete_service(
    service_id: str,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.delete_service(db=db, service_id=service_id)


# 4. Counters CRUD (/api/admin/counters)
@router.get("/counters", response_model=List[CounterDetailResponse])
def get_counters(
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.list_counters(db)

@router.post("/counters", response_model=CounterDetailResponse, status_code=status.HTTP_201_CREATED)
def create_counter(
    body: AdminCounterCreate,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.create_counter(
        db=db,
        name=body.name,
        service_id=body.service_id,
        status_val=body.status
    )

@router.patch("/counters/{counter_id}", response_model=CounterDetailResponse)
def update_counter(
    counter_id: str,
    body: AdminCounterUpdate,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.update_counter(
        db=db,
        counter_id=counter_id,
        name=body.name,
        service_id=body.service_id,
        status_val=body.status
    )

@router.delete("/counters/{counter_id}")
def delete_counter(
    counter_id: str,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.delete_counter(db=db, counter_id=counter_id)

@router.patch("/counters/{counter_id}/assign-staff", response_model=AssignStaffResponse)
def assign_staff(
    counter_id: str,
    body: AssignStaffRequest,
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.assign_staff(
        db=db,
        counter_id=counter_id,
        staff_id=body.staffId
    )


# 5. GET /api/admin/live-monitor
@router.get("/live-monitor", response_model=List[LiveMonitorCounterItem])
def get_live_monitor(
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.get_live_monitor(db)


# 6. GET /api/admin/analytics
@router.get("/analytics", response_model=AdminAnalyticsResponse)
def get_analytics(
    current_admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db)
):
    return admin_service.get_analytics(db)
