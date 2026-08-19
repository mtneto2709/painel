"""Healthcheck — inclui checagem opcional de conectividade com as 3 bases."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_app_db
from app.config import get_settings
from app.db.esus import get_esus_engine
from app.db.readonly import check_connection
from app.db.sistema_is import get_sistema_is_engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/health/dependencies")
def health_dependencies(app_db: Session = Depends(get_app_db)) -> dict:
    settings = get_settings()
    status: dict[str, str] = {}

    try:
        app_db.execute(text("SELECT 1"))
        status["app_db"] = "ok"
    except Exception as exc:  # noqa: BLE001
        status["app_db"] = f"erro: {exc}"

    if settings.esus.is_configured:
        try:
            check_connection(get_esus_engine())
            status["esus_db"] = "ok"
        except Exception as exc:  # noqa: BLE001
            status["esus_db"] = f"erro: {exc}"
    else:
        status["esus_db"] = "não configurado"

    if settings.sistema_is.is_configured:
        try:
            check_connection(get_sistema_is_engine())
            status["sistema_is_db"] = "ok"
        except Exception as exc:  # noqa: BLE001
            status["sistema_is_db"] = f"erro: {exc}"
    else:
        status["sistema_is_db"] = "não configurado"

    return status
