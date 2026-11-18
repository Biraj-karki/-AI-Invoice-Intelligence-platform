from fastapi import APIRouter, Depends

from app.api.v1 import auth, health, invoices
from app.core.auth import get_current_user

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(
    invoices.router,
    # Applied once here rather than on each endpoint: an invoice route added
    # later cannot forget to require a signed-in user.
    dependencies=[Depends(get_current_user)],
)
