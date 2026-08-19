"""Interface comum aos ingestores de fontes médico-científicas (Fonte 2).

Cada ingestor sabe buscar documentos de UMA fonte e devolvê-los em um
formato normalizado (`IngestedDocument`); `run()` persiste via
`app/rag/vector_store.upsert_document`, que já é idempotente (reingestão
não duplica nem reprocessa embeddings de conteúdo inalterado).

Novos conectores (Cochrane, UpToDate, DynaMed etc., quando/se contratados)
devem seguir esta mesma interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.rag.vector_store import upsert_document


@dataclass(frozen=True)
class IngestedDocument:
    external_id: str
    title: str
    url: str
    content: str
    published_at: datetime | None = None


class BaseIngestor(ABC):
    source: str

    @abstractmethod
    def fetch(self) -> list[IngestedDocument]:
        """Busca os documentos na fonte externa. Não toca no banco."""

    def run(self, session: Session) -> int:
        documents = self.fetch()
        for doc in documents:
            upsert_document(
                session,
                source=self.source,
                external_id=doc.external_id,
                title=doc.title,
                url=doc.url,
                content=doc.content,
                published_at=doc.published_at,
            )
        session.commit()
        return len(documents)
