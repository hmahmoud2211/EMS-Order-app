from fastapi import APIRouter

from app.api.v1.routers import (
    admin,
    auth,
    employees,
    health,
    menu,
    notifications,
    orders,
    restaurants,
    sessions,
    uploads,
)

api_router = APIRouter()
for module in (health, auth, employees, restaurants, menu, sessions, orders, admin, notifications, uploads):
    api_router.include_router(module.router)
