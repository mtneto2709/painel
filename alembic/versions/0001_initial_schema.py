"""schema inicial do app db (cache, sessões, memória vetorial, auditoria)

Revision ID: 0001
Revises:
Create Date: 2026-08-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Deve refletir EMBEDDINGS_DIM do .env no momento desta migração. Trocar de
# modelo de embeddings para um com dimensão diferente exige nova migração
# (ALTER COLUMN ... TYPE vector(nova_dim)) e reingestão da base vetorial.
EMBEDDING_DIM = 768


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "patient_profile_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_identity_key", sa.String(32), nullable=False),
        sa.Column("patient_identity_value", sa.String(64), nullable=False),
        sa.Column("history_hash", sa.String(64), nullable=False),
        sa.Column("report_json", sa.JSON, nullable=False),
        sa.Column("report_markdown", sa.Text, nullable=False),
        sa.Column("model_used", sa.String(64), nullable=False),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_patient_profile_identity_hash",
        "patient_profile_cache",
        ["patient_identity_value", "history_hash"],
    )

    op.create_table(
        "source_document",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("external_id", sa.String(128), nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("license", sa.String(64), nullable=False, server_default="public"),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_source_document_source", "source_document", ["source"])
    op.create_index(
        "ix_source_document_source_external",
        "source_document",
        ["source", "external_id"],
        unique=True,
    )

    op.create_table(
        "document_chunk",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("source_document.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("token_count", sa.Integer, nullable=False),
        sa.Column("metadata_json", sa.JSON, nullable=False, server_default="{}"),
    )
    op.create_index("ix_document_chunk_document_id", "document_chunk", ["document_id"])
    op.execute(
        "CREATE INDEX ix_document_chunk_embedding ON document_chunk "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "consultation_session",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_identity_key", sa.String(32), nullable=False),
        sa.Column("patient_identity_value", sa.String(64), nullable=False),
        sa.Column("professional_id", sa.String(64), nullable=False),
        sa.Column(
            "profile_cache_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patient_profile_cache.id"),
            nullable=True,
        ),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transcript_json", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("profile_snapshot_json", sa.JSON, nullable=False, server_default="{}"),
    )
    op.create_index(
        "ix_consultation_session_patient", "consultation_session", ["patient_identity_value"]
    )
    op.create_index(
        "ix_consultation_session_professional", "consultation_session", ["professional_id"]
    )

    op.create_table(
        "consultation_suggestion",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("consultation_session.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("turn_index", sa.Integer, nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("citations", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("accepted_by_professional", sa.Boolean, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_consultation_suggestion_session", "consultation_suggestion", ["session_id"]
    )

    op.create_table(
        "llm_usage_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("situation", sa.String(32), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cache_read_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cache_write_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("patient_identity_value", sa.String(64), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("professional_id", sa.String(64), nullable=True),
    )
    op.create_index("ix_llm_usage_log_occurred_at", "llm_usage_log", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("llm_usage_log")
    op.drop_table("consultation_suggestion")
    op.drop_table("consultation_session")
    op.drop_table("document_chunk")
    op.drop_table("source_document")
    op.drop_table("patient_profile_cache")
