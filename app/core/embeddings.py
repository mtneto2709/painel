"""Geração de embeddings para o RAG.

Por padrão usa um modelo local (`sentence-transformers`), que roda em
CPU/GPU própria e tem **custo marginal zero por chamada** — decisão de
arquitetura central para manter o custo baixo em escala, já que embeddings
são gerados não só na ingestão da literatura (evento raro) mas também em
**toda busca feita por um profissional durante um atendimento** (evento
frequente, milhares por dia). Se a qualidade do modelo local não for
suficiente, trocar para Voyage AI é uma mudança de configuração
(`EMBEDDINGS_PROVIDER=voyage`), sem alterar o resto do pipeline de RAG.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Protocol

from app.config import get_settings


class EmbeddingsClient(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class LocalEmbeddingsClient:
    """Embeddings locais via sentence-transformers (custo zero por chamada)."""

    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        return self._model.encode(texts, normalize_embeddings=True).tolist()

    def embed_query(self, text: str) -> list[float]:
        return self.embed([text])[0]


class VoyageEmbeddingsClient:
    """Embeddings via Voyage AI (parceiro recomendado pela Anthropic).

    Maior qualidade potencial, porém cobrado por token — usar apenas se o
    orçamento permitir e a avaliação (Fase 5 do roadmap) mostrar ganho
    relevante de recall sobre o modelo local.
    """

    def __init__(self, api_key: str) -> None:
        import voyageai

        self._client = voyageai.Client(api_key=api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        result = self._client.embed(texts, model="voyage-3", input_type="document")
        return result.embeddings

    def embed_query(self, text: str) -> list[float]:
        result = self._client.embed([text], model="voyage-3", input_type="query")
        return result.embeddings[0]


@lru_cache
def get_embeddings_client() -> EmbeddingsClient:
    settings = get_settings()
    if settings.embeddings_provider == "voyage":
        return VoyageEmbeddingsClient(settings.voyage_api_key)
    return LocalEmbeddingsClient(settings.embeddings_local_model)
