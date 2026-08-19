"""Situação 1 — endpoint de consulta/geração do perfil clínico do paciente."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_app_db, get_esus_db, get_sistema_is_db
from app.config import get_settings
from app.core.security import require_api_key
from app.schemas.patient_profile import PatientProfileResponse
from app.services.situacao1_profile import get_or_generate_profile

router = APIRouter(prefix="/v1/patients", tags=["situacao-1-perfil-clinico"], dependencies=[Depends(require_api_key)])


@router.get("/{identity_value}/clinical-profile", response_model=PatientProfileResponse)
def get_clinical_profile(
    identity_value: str,
    app_db: Session = Depends(get_app_db),
    esus_db: Session = Depends(get_esus_db),
    sistema_is_db: Session = Depends(get_sistema_is_db),
) -> PatientProfileResponse:
    """Retorna o perfil clínico estruturado do paciente (Situação 1).

    Serve do cache sempre que o histórico do paciente não mudou desde a
    última geração (ver `app/services/situacao1_profile.py`) — a maioria
    das chamadas deste endpoint tem custo zero de LLM.
    """
    settings = get_settings()
    return get_or_generate_profile(
        app_db,
        esus_db,
        sistema_is_db,
        identity_key=settings.patient_identity_key,
        identity_value=identity_value,
    )
