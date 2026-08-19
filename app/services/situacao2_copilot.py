"""Situação 2 — copiloto em tempo real durante o atendimento.

Reaproveita o perfil já cacheado da Situação 1 (não recalcula nada do
histórico a cada turno) e usa um gate barato (Haiku) para decidir se um
novo trecho de conversa justifica uma nova chamada ao modelo "primary" —
evitando gerar sugestões a cada frase trivial da consulta
(ARCHITECTURE.md §5, item 3).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.llm import ClaudeClient, cacheable_block
from app.db.models import ConsultationSession, ConsultationSuggestion, LLMUsageLog
from app.rag.retriever import format_chunks_for_prompt, retrieve_for_topics
from app.schemas.patient_profile import PatientClinicalProfile
from app.services.prompts.situacao2_system import SITUACAO2_SYSTEM_PROMPT


def start_session(
    app_session: Session,
    *,
    patient_identity_key: str,
    patient_identity_value: str,
    professional_id: str,
    profile: PatientClinicalProfile,
    profile_cache_id: UUID | None,
) -> ConsultationSession:
    session = ConsultationSession(
        patient_identity_key=patient_identity_key,
        patient_identity_value=patient_identity_value,
        professional_id=professional_id,
        profile_cache_id=profile_cache_id,
        status="open",
        started_at=datetime.now(timezone.utc),
        transcript_json=[],
        profile_snapshot_json=profile.model_dump(),
    )
    app_session.add(session)
    app_session.flush()
    return session


def _should_generate_suggestion(llm: ClaudeClient, transcript: list[dict], new_turn_text: str) -> bool:
    if len(transcript) == 0:
        return True  # primeiro turno sempre gera (ex.: sugestões iniciais de anamnese)

    recent = transcript[-4:]
    context = "\n".join(f"{t['autor']}: {t['texto']}" for t in recent)
    result = llm.complete(
        tier="fast",
        system=(
            "Responda apenas 'sim' ou 'nao'. O NOVO TRECHO abaixo adiciona "
            "informação clínica relevante o suficiente para justificar gerar "
            "novas sugestões de anamnese/diagnóstico/conduta, considerando o "
            "contexto recente da consulta?"
        ),
        messages=[
            {"role": "user", "content": f"Contexto recente:\n{context}\n\nNovo trecho:\n{new_turn_text}"}
        ],
        max_tokens=5,
    )
    return "sim" in result.text.strip().lower()


def _topics_from_turn(new_turn_text: str) -> list[str]:
    # Passo leve e determinístico (sem LLM): usa o próprio trecho como query
    # de busca na literatura — mantém o gate de custo simples e previsível.
    return [new_turn_text[:300]]


def process_turn(
    app_session: Session,
    session: ConsultationSession,
    *,
    autor: str,
    texto: str,
) -> Iterator[str] | None:
    """Retorna um iterador de tokens de texto (para streaming via SSE) se uma
    nova sugestão for gerada, ou `None` se o gate decidiu não gerar (economia
    de chamada ao modelo primário).

    O chamador (rota da API) é responsável por consumir o iterador, persistir
    o resultado final (`finalize_turn`) e registrar o uso de LLM.
    """
    llm = ClaudeClient()
    transcript = session.transcript_json or []
    transcript.append({"autor": autor, "texto": texto, "at": datetime.now(timezone.utc).isoformat()})
    session.transcript_json = transcript

    if not _should_generate_suggestion(llm, transcript[:-1], texto):
        return None

    guideline_chunks = retrieve_for_topics(app_session, _topics_from_turn(texto), top_k_per_topic=2)
    guidelines_text = format_chunks_for_prompt(guideline_chunks)

    profile_json = json.dumps(session.profile_snapshot_json, ensure_ascii=False)
    transcript_text = "\n".join(f"{t['autor']}: {t['texto']}" for t in transcript)

    system_blocks = [
        cacheable_block(SITUACAO2_SYSTEM_PROMPT),
        cacheable_block(f"Perfil do paciente (Situação 1):\n{profile_json}"),
        cacheable_block(f"Diretrizes recuperadas para o trecho atual:\n{guidelines_text}"),
    ]

    return llm.stream(
        tier="primary",
        system=system_blocks,
        messages=[{"role": "user", "content": f"Transcrição da consulta até agora:\n{transcript_text}"}],
        max_tokens=800,
    )


def finalize_turn(
    app_session: Session,
    session: ConsultationSession,
    *,
    turn_index: int,
    generated_text: str,
    llm: ClaudeClient,
) -> ConsultationSuggestion:
    """Persiste a sugestão gerada e o uso de LLM após o streaming terminar."""
    usage = llm.last_stream_usage
    now = datetime.now(timezone.utc)

    suggestion = ConsultationSuggestion(
        session_id=session.id,
        turn_index=turn_index,
        kind="mixed",  # o front-end pode segmentar por marcadores no texto, se necessário
        content=generated_text,
        citations=[],
        created_at=now,
    )
    app_session.add(suggestion)
    app_session.add(
        LLMUsageLog(
            occurred_at=now,
            situation="situacao_2",
            model=usage.model,
            input_tokens=usage.input_tokens,
            cache_read_tokens=usage.cache_read_tokens,
            cache_write_tokens=usage.cache_write_tokens,
            output_tokens=usage.output_tokens,
            estimated_cost_usd=usage.estimated_cost_usd,
            patient_identity_value=session.patient_identity_value,
            session_id=session.id,
            professional_id=session.professional_id,
        )
    )
    return suggestion
