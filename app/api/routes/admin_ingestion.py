"""Endpoint administrativo somente-leitura para observabilidade da base de
conhecimento (Fonte 2). A execução da ingestão em si é feita via CLI
(`scripts/ingest_sources.py`, tipicamente por cron/job agendado), não por
esta API — evita disparar jobs pesados/custosos por engano via HTTP.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_app_db
from app.core.security import require_api_key
from app.db.models import LLMUsageLog, SourceDocument

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_api_key)])


@router.get("/knowledge-base/stats")
def knowledge_base_stats(app_db: Session = Depends(get_app_db)) -> dict:
    rows = app_db.execute(
        select(SourceDocument.source, func.count(SourceDocument.id)).group_by(SourceDocument.source)
    ).all()
    return {"documentos_por_fonte": {source: count for source, count in rows}}


@router.get("/llm-usage/summary")
def llm_usage_summary(app_db: Session = Depends(get_app_db)) -> dict:
    rows = app_db.execute(
        select(
            LLMUsageLog.situation,
            func.count(LLMUsageLog.id),
            func.sum(LLMUsageLog.estimated_cost_usd),
        ).group_by(LLMUsageLog.situation)
    ).all()
    return {
        "por_situacao": [
            {"situacao": situation, "chamadas": count, "custo_estimado_usd": round(cost or 0, 4)}
            for situation, count, cost in rows
        ]
    }
