"""Contratos da Situação 2 — copiloto em tempo real durante o atendimento."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.patient_profile import PatientClinicalProfile


class StartConsultationRequest(BaseModel):
    patient_identity_value: str
    professional_id: str


class StartConsultationResponse(BaseModel):
    session_id: UUID
    profile: PatientClinicalProfile


class ConsultationTurnRequest(BaseModel):
    autor: str  # paciente|profissional
    texto: str


class ConsultationSuggestionOut(BaseModel):
    kind: str  # anamnese|diagnostico|exame|medicacao|conduta
    content: str
    citations: list[dict] = []
    created_at: datetime
