"""Ponto de entrada do microserviço `clinical-rag-agent`.

Rodar localmente: `uvicorn app.main:app --reload --port 8080`
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.api.routes import admin_ingestion, consultation, health, patient_profile
from app.config import get_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(
    title="clinical-rag-agent",
    description=(
        "Microserviço de apoio clínico com RAG — Situação 1 (perfil "
        "retrospectivo do paciente) e Situação 2 (copiloto em tempo real de "
        "atendimento). Ver ARCHITECTURE.md."
    ),
    version="0.1.0",
)

app.include_router(health.router)
app.include_router(patient_profile.router)
app.include_router(consultation.router)
app.include_router(admin_ingestion.router)
