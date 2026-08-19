"""Ingestor genérico para fontes sem API estável (RENAME, WHO Guidelines,
NICE, Cadernos de Atenção Básica, resoluções do CFM, bulários da ANVISA...).

Muitas dessas fontes publicam conteúdo como PDF/HTML avulso, sem um
endpoint de API único e estável — diferente da PubMed (E-utilities) ou do
PCDT (CKAN), que têm ingestores dedicados. Para essas, o caminho mais
robusto é curar manualmente a lista de documentos (título, URL, fonte) em
um arquivo de configuração, e deixar este ingestor genérico baixar e
indexar o conteúdo — evitando scrapers frágeis que quebram a cada mudança
de layout do site de origem.

Uso:
    ingestor = ManualSourceIngestor(
        source="rename",
        documents=[
            {"external_id": "rename-2024", "title": "RENAME 2024",
             "url": "https://.../rename_2024.pdf"},
        ],
    )
    ingestor.run(session)

A lista pode vir de `data/manual_sources/<source>.json` (ver
`scripts/ingest_sources.py`).
"""

from __future__ import annotations

import io

import httpx

from app.rag.ingestion.base import BaseIngestor, IngestedDocument


class ManualSourceIngestor(BaseIngestor):
    def __init__(self, source: str, documents: list[dict]):
        self.source = source
        self._documents = documents

    @staticmethod
    def _extract_text(url: str, content: bytes, content_type: str) -> str:
        if url.lower().endswith(".pdf") or "pdf" in content_type:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(content))
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(content, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return soup.get_text(separator="\n\n", strip=True)

    def fetch(self) -> list[IngestedDocument]:
        documents: list[IngestedDocument] = []
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            for entry in self._documents:
                try:
                    response = client.get(entry["url"])
                    response.raise_for_status()
                    text = self._extract_text(
                        entry["url"], response.content, response.headers.get("content-type", "")
                    )
                except Exception:
                    continue

                if not text.strip():
                    continue

                documents.append(
                    IngestedDocument(
                        external_id=entry["external_id"],
                        title=entry["title"],
                        url=entry["url"],
                        content=text,
                    )
                )
        return documents
