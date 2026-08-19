"""Memória vetorial (pgvector) — armazenamento e busca por similaridade.

Reaproveita o Postgres do próprio serviço (extensão `pgvector`) em vez de
subir um banco vetorial dedicado: menos uma peça de infraestrutura para
operar/pagar, e o volume de literatura médica curada (milhares, não bilhões
de chunks) não justifica um vector DB especializado nesta escala.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.embeddings import get_embeddings_client
from app.db.models import DocumentChunk, SourceDocument
from app.rag.chunking import chunk_text


@dataclass(frozen=True)
class RetrievedChunk:
    content: str
    source: str
    title: str
    url: str
    score: float


def upsert_document(
    session: Session,
    *,
    source: str,
    external_id: str,
    title: str,
    url: str,
    content: str,
    published_at: datetime | None = None,
    license_: str = "public",
) -> SourceDocument:
    """Insere ou atualiza um documento de origem e re-chunkifica/embeda seu
    conteúdo. Idempotente: reexecutar o ingestor sobre a mesma fonte não
    duplica dados (chave única `source + external_id`).
    """
    checksum = hashlib.sha256(content.encode("utf-8")).hexdigest()

    existing = session.execute(
        select(SourceDocument).where(
            SourceDocument.source == source, SourceDocument.external_id == external_id
        )
    ).scalar_one_or_none()

    if existing and existing.checksum == checksum:
        return existing  # conteúdo não mudou — não reprocessa (economia de embeddings)

    if existing:
        for chunk in list(existing.chunks):
            session.delete(chunk)
        document = existing
        document.title = title
        document.url = url
        document.checksum = checksum
        document.published_at = published_at
        document.ingested_at = datetime.now(timezone.utc)
    else:
        document = SourceDocument(
            source=source,
            external_id=external_id,
            title=title,
            url=url,
            checksum=checksum,
            published_at=published_at,
            license=license_,
            ingested_at=datetime.now(timezone.utc),
        )
        session.add(document)
        session.flush()  # garante document.id antes de criar os chunks

    embeddings_client = get_embeddings_client()
    text_chunks = chunk_text(content)
    if text_chunks:
        vectors = embeddings_client.embed(text_chunks)
        for index, (chunk_content, vector) in enumerate(zip(text_chunks, vectors)):
            session.add(
                DocumentChunk(
                    document_id=document.id,
                    chunk_index=index,
                    content=chunk_content,
                    embedding=vector,
                    token_count=len(chunk_content) // 4,  # estimativa grosseira
                    metadata_json={},
                )
            )

    return document


def search(session: Session, query: str, top_k: int = 5, sources: list[str] | None = None) -> list[RetrievedChunk]:
    """Busca por similaridade de cosseno na literatura médica indexada.

    `sources`, quando informado, restringe a busca (ex.: priorizar PCDT
    nacional antes de recorrer a literatura internacional).
    """
    query_vector = get_embeddings_client().embed_query(query)

    stmt = (
        select(
            DocumentChunk.content,
            SourceDocument.source,
            SourceDocument.title,
            SourceDocument.url,
            DocumentChunk.embedding.cosine_distance(query_vector).label("distance"),
        )
        .join(SourceDocument, SourceDocument.id == DocumentChunk.document_id)
        .order_by("distance")
        .limit(top_k)
    )
    if sources:
        stmt = stmt.where(SourceDocument.source.in_(sources))

    rows = session.execute(stmt).all()
    return [
        RetrievedChunk(content=r.content, source=r.source, title=r.title, url=r.url, score=1 - r.distance)
        for r in rows
    ]
