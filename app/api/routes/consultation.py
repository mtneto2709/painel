"""Situação 2 — sessão de atendimento em tempo real (copiloto)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_app_db, get_esus_db, get_sistema_is_db
from app.config import get_settings
from app.core.llm import ClaudeClient
from app.core.security import require_api_key
from app.db.models import ConsultationSession
from app.schemas.consultation import (
    ConsultationTurnRequest,
    StartConsultationRequest,
    StartConsultationResponse,
)
from app.services import situacao2_copilot
from app.services.situacao1_profile import get_or_generate_profile

router = APIRouter(prefix="/v1/consultations", tags=["situacao-2-copiloto"], dependencies=[Depends(require_api_key)])


@router.post("", response_model=StartConsultationResponse)
def start_consultation(
    payload: StartConsultationRequest,
    app_db: Session = Depends(get_app_db),
    esus_db: Session = Depends(get_esus_db),
    sistema_is_db: Session = Depends(get_sistema_is_db),
) -> StartConsultationResponse:
    """Abre uma sessão de atendimento, reaproveitando o perfil da Situação 1
    (gera na hora se ainda não houver cache válido)."""
    settings = get_settings()
    profile_response = get_or_generate_profile(
        app_db,
        esus_db,
        sistema_is_db,
        identity_key=settings.patient_identity_key,
        identity_value=payload.patient_identity_value,
    )

    session = situacao2_copilot.start_session(
        app_db,
        patient_identity_key=settings.patient_identity_key,
        patient_identity_value=payload.patient_identity_value,
        professional_id=payload.professional_id,
        profile=profile_response.profile,
        profile_cache_id=None,
    )
    app_db.commit()

    return StartConsultationResponse(session_id=session.id, profile=profile_response.profile)


@router.post("/{session_id}/turns")
def send_turn(
    session_id: UUID,
    payload: ConsultationTurnRequest,
    app_db: Session = Depends(get_app_db),
):
    """Envia um novo trecho da consulta (fala do paciente ou do profissional)
    e recebe, em streaming (SSE), as sugestões incrementais — se o gate de
    custo decidir que há informação nova o suficiente para gerar uma.
    """
    session = app_db.get(ConsultationSession, session_id)
    if session is None or session.status != "open":
        raise HTTPException(status_code=404, detail="Sessão de atendimento não encontrada ou encerrada")

    llm = ClaudeClient()
    stream = situacao2_copilot.process_turn(app_db, session, autor=payload.autor, texto=payload.texto)

    if stream is None:
        app_db.commit()  # persiste o novo turno no transcript mesmo sem gerar sugestão
        return StreamingResponse(iter(["event: no-suggestion\ndata: {}\n\n"]), media_type="text/event-stream")

    def event_source():
        chunks: list[str] = []
        for token in stream:
            chunks.append(token)
            yield f"data: {token}\n\n"

        full_text = "".join(chunks)
        turn_index = len(session.transcript_json)
        situacao2_copilot.finalize_turn(
            app_db, session, turn_index=turn_index, generated_text=full_text, llm=llm
        )
        app_db.commit()
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


@router.post("/{session_id}/close")
def close_consultation(session_id: UUID, app_db: Session = Depends(get_app_db)) -> dict:
    from datetime import datetime, timezone

    session = app_db.get(ConsultationSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    session.status = "closed"
    session.ended_at = datetime.now(timezone.utc)
    app_db.commit()
    return {"status": "closed"}
