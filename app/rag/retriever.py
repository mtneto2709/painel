"""Orquestração de recuperação usada pelas Situações 1 e 2.

Importante: a decisão de *se* vale a pena buscar (triagem) é feita pelos
serviços (`app/services/*.py`) usando o modelo "fast" — este módulo só
executa a busca em si, priorizando fontes nacionais (PCDT/RENAME) antes de
recorrer à literatura internacional, como definido em ARCHITECTURE.md §3.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.rag.vector_store import RetrievedChunk, search

NATIONAL_SOURCES = ["pcdt", "rename", "cadernos_atencao_basica", "cfm"]
INTERNATIONAL_SOURCES = ["who", "nice", "pubmed"]


def retrieve_for_topics(
    session: Session, topics: list[str], top_k_per_topic: int = 3
) -> list[RetrievedChunk]:
    """Recupera diretrizes para uma lista de tópicos clínicos sinalizados.

    Estratégia: tenta primeiro nas fontes nacionais; só complementa com
    fontes internacionais se a fonte nacional não tiver cobertura suficiente
    (menos de `top_k_per_topic` resultados relevantes).
    """
    results: list[RetrievedChunk] = []
    seen_content: set[str] = set()

    for topic in topics:
        national = search(session, topic, top_k=top_k_per_topic, sources=NATIONAL_SOURCES)
        combined = national
        if len(national) < top_k_per_topic:
            remaining = top_k_per_topic - len(national)
            combined = national + search(
                session, topic, top_k=remaining, sources=INTERNATIONAL_SOURCES
            )
        for chunk in combined:
            if chunk.content not in seen_content:
                seen_content.add(chunk.content)
                results.append(chunk)

    return results


def format_chunks_for_prompt(chunks: list[RetrievedChunk]) -> str:
    """Formata os trechos recuperados como contexto citável para o prompt."""
    if not chunks:
        return "Nenhuma diretriz específica recuperada para este caso."

    parts = []
    for chunk in chunks:
        parts.append(f"[Fonte: {chunk.source} | {chunk.title} | {chunk.url}]\n{chunk.content}")
    return "\n\n---\n\n".join(parts)
