from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Liveness check used by tests and, later, by the frontend."""
    return {"status": "ok"}
