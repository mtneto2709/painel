"""Situação 1 — análise retrospectiva do prontuário → perfil clínico
estruturado, com cache agressivo por hash do histórico (ver ARCHITECTURE.md
§5, item 1 — a principal alavanca de economia do serviço).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.llm import ClaudeClient, cacheable_block
from app.db.models import LLMUsageLog, PatientProfileCache
from app.rag.retriever import format_chunks_for_prompt, retrieve_for_topics
from app.repositories.esus_repository import EsusRepository
from app.repositories.sistema_is_repository import SistemaISRepository
from app.schemas.patient_profile import PatientClinicalProfile, PatientProfileResponse
from app.services.prompts.situacao1_system import SITUACAO1_SYSTEM_PROMPT

CACHE_TTL = timedelta(hours=12)


def _collect_raw_history(esus_session: Session, sistema_is_session: Session, identity_value: str) -> dict:
    esus_repo = EsusRepository(esus_session)
    is_repo = SistemaISRepository(sistema_is_session)

    return {
        "atendimentos_esus": [asdict(a) for a in esus_repo.historico_atendimentos(identity_value)],
        "medicacoes_esus": [asdict(m) for m in esus_repo.medicacoes_em_uso(identity_value)],
        "atendimentos_sistema_is": [
            asdict(a) for a in is_repo.historico_atendimentos(identity_value)
        ],
        "exames_sistema_is": [asdict(e) for e in is_repo.exames(identity_value)],
        "alergias_sistema_is": [asdict(a) for a in is_repo.alergias(identity_value)],
    }


def _history_hash(raw_history: dict) -> str:
    canonical = json.dumps(raw_history, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _identify_topics(llm: ClaudeClient, raw_history: dict) -> list[str]:
    """Passo barato (Haiku) que decide QUAIS tópicos merecem checagem em
    literatura médica — evita RAG exaustivo sobre todo o histórico
    (ARCHITECTURE.md §5, item 4).
    """
    compact = json.dumps(raw_history, ensure_ascii=False, default=str)[:6000]
    result = llm.complete(
        tier="fast",
        system=(
            "Liste, em JSON (lista de strings, máx. 5 itens), tópicos clínicos "
            "deste histórico que merecem checagem em diretrizes médicas "
            "(ex.: interações medicamentosas suspeitas, condições crônicas mal "
            "controladas, rastreamentos pendentes). Responda só o JSON."
        ),
        messages=[{"role": "user", "content": compact}],
        max_tokens=200,
    )
    try:
        topics = json.loads(result.text)
        return [str(t) for t in topics][:5] if isinstance(topics, list) else []
    except (json.JSONDecodeError, ValueError):
        return []


def _generate_profile(llm: ClaudeClient, raw_history: dict, guidelines_text: str) -> tuple[PatientClinicalProfile, "object"]:
    schema_hint = json.dumps(PatientClinicalProfile.model_json_schema(), ensure_ascii=False)
    system_blocks = [
        cacheable_block(SITUACAO1_SYSTEM_PROMPT),
        cacheable_block(f"Schema JSON esperado na resposta:\n{schema_hint}"),
    ]
    user_content = (
        f"Histórico clínico estruturado do paciente:\n{json.dumps(raw_history, ensure_ascii=False, default=str)}\n\n"
        f"Trechos de diretrizes recuperados:\n{guidelines_text}"
    )
    result = llm.complete(
        tier="primary",
        system=system_blocks,
        messages=[{"role": "user", "content": user_content}],
        max_tokens=2000,
    )
    profile = PatientClinicalProfile.model_validate(json.loads(result.text))
    return profile, result.usage


def get_or_generate_profile(
    app_session: Session,
    esus_session: Session,
    sistema_is_session: Session,
    identity_key: str,
    identity_value: str,
) -> PatientProfileResponse:
    raw_history = _collect_raw_history(esus_session, sistema_is_session, identity_value)
    history_hash = _history_hash(raw_history)

    cached = app_session.execute(
        select(PatientProfileCache)
        .where(
            PatientProfileCache.patient_identity_value == identity_value,
            PatientProfileCache.history_hash == history_hash,
        )
        .order_by(PatientProfileCache.generated_at.desc())
    ).scalars().first()

    if cached and (cached.expires_at is None or cached.expires_at > datetime.now(timezone.utc)):
        return PatientProfileResponse(
            patient_identity_value=identity_value,
            profile=PatientClinicalProfile.model_validate(cached.report_json),
            generated_at=cached.generated_at,
            from_cache=True,
            history_hash=history_hash,
        )

    llm = ClaudeClient()
    topics = _identify_topics(llm, raw_history)
    guideline_chunks = retrieve_for_topics(app_session, topics) if topics else []
    guidelines_text = format_chunks_for_prompt(guideline_chunks)

    profile, usage = _generate_profile(llm, raw_history, guidelines_text)
    now = datetime.now(timezone.utc)

    app_session.add(
        PatientProfileCache(
            patient_identity_key=identity_key,
            patient_identity_value=identity_value,
            history_hash=history_hash,
            report_json=profile.model_dump(),
            report_markdown=profile.resumo_clinico,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            estimated_cost_usd=usage.estimated_cost_usd,
            generated_at=now,
            expires_at=now + CACHE_TTL,
        )
    )
    app_session.add(
        LLMUsageLog(
            occurred_at=now,
            situation="situacao_1",
            model=usage.model,
            input_tokens=usage.input_tokens,
            cache_read_tokens=usage.cache_read_tokens,
            cache_write_tokens=usage.cache_write_tokens,
            output_tokens=usage.output_tokens,
            estimated_cost_usd=usage.estimated_cost_usd,
            patient_identity_value=identity_value,
        )
    )

    return PatientProfileResponse(
        patient_identity_value=identity_value,
        profile=profile,
        generated_at=now,
        from_cache=False,
        history_hash=history_hash,
    )
