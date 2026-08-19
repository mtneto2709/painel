"""Modelos do banco próprio do microserviço."""

from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import get_settings
from app.db.base import Base

EMBEDDING_DIM = get_settings().embeddings_dim


class PatientProfileCache(Base):
    """Resultado cacheado da Situação 1 — perfil clínico estruturado.

    `history_hash` é o hash determinístico do histórico bruto usado para
    gerar o relatório (atendimentos, diagnósticos, medicações, exames das
    duas fontes). Uma nova geração só é disparada quando o hash muda —
    é a principal alavanca de economia do serviço (ver ARCHITECTURE.md §5).
    """

    __tablename__ = "patient_profile_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_identity_key: Mapped[str] = mapped_column(String(32))
    patient_identity_value: Mapped[str] = mapped_column(String(64), index=True)
    history_hash: Mapped[str] = mapped_column(String(64), index=True)
    report_json: Mapped[dict] = mapped_column(JSON)
    report_markdown: Mapped[str] = mapped_column(Text)
    model_used: Mapped[str] = mapped_column(String(64))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_patient_profile_identity_hash", "patient_identity_value", "history_hash"),
    )


class ConsultationSession(Base):
    """Estado de uma sessão de atendimento em andamento (Situação 2)."""

    __tablename__ = "consultation_session"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_identity_key: Mapped[str] = mapped_column(String(32))
    patient_identity_value: Mapped[str] = mapped_column(String(64), index=True)
    professional_id: Mapped[str] = mapped_column(String(64), index=True)
    profile_cache_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patient_profile_cache.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|closed
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transcript_json: Mapped[list] = mapped_column(JSON, default=list)
    profile_snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)

    suggestions: Mapped[list["ConsultationSuggestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class ConsultationSuggestion(Base):
    """Cada sugestão incremental gerada durante a consulta (auditável)."""

    __tablename__ = "consultation_suggestion"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("consultation_session.id"), index=True
    )
    turn_index: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(32))  # anamnese|diagnostico|exame|medicacao|conduta
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    accepted_by_professional: Mapped[bool | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    session: Mapped[ConsultationSession] = relationship(back_populates="suggestions")


class SourceDocument(Base):
    """Documento de origem da Fonte 2 (literatura médico-científica)."""

    __tablename__ = "source_document"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(32), index=True)  # pcdt|rename|who|nice|pubmed...
    external_id: Mapped[str] = mapped_column(String(128))
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    license: Mapped[str] = mapped_column(String(64), default="public")
    checksum: Mapped[str] = mapped_column(String(64))
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_source_document_source_external", "source", "external_id", unique=True),)


class DocumentChunk(Base):
    """Trecho vetorizado de um documento — unidade de recuperação do RAG."""

    __tablename__ = "document_chunk"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_document.id"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    token_count: Mapped[int] = mapped_column(Integer)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    document: Mapped[SourceDocument] = relationship(back_populates="chunks")


class LLMUsageLog(Base):
    """Auditoria de custo — uma linha por chamada ao LLM (ver core/costs.py)."""

    __tablename__ = "llm_usage_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    situation: Mapped[str] = mapped_column(String(32))  # situacao_1|situacao_2|ingestion
    model: Mapped[str] = mapped_column(String(64))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    patient_identity_value: Mapped[str | None] = mapped_column(String(64), nullable=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    professional_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
