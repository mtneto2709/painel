"""Ingestor da PubMed/MEDLINE via NCBI E-utilities.

Gratuito e sem necessidade de chave (a chave apenas aumenta o rate limit de
3 para 10 req/s — configurável em `NCBI_EUTILS_API_KEY`).
Documentação: https://www.ncbi.nlm.nih.gov/books/NBK25497/

Este ingestor busca, para uma lista de tópicos/queries clínicas, os
resumos (abstracts) mais relevantes/recentes — não o texto completo (grande
parte dos artigos não é open access). Isso já é suficiente para o RAG citar
evidência internacional quando não há PCDT nacional aplicável.
"""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx

from app.config import get_settings
from app.rag.ingestion.base import BaseIngestor, IngestedDocument

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


class PubMedIngestor(BaseIngestor):
    source = "pubmed"

    def __init__(self, queries: list[str], max_results_per_query: int = 20):
        self._queries = queries
        self._max_results = max_results_per_query
        settings = get_settings()
        self._email = settings.ncbi_eutils_email
        self._api_key = settings.ncbi_eutils_api_key
        self._min_interval = 0.11 if self._api_key else 0.35  # respeita rate limit

    def _common_params(self) -> dict[str, str]:
        params = {"retmode": "xml", "db": "pubmed"}
        if self._email:
            params["email"] = self._email
        if self._api_key:
            params["api_key"] = self._api_key
        return params

    def _esearch(self, client: httpx.Client, query: str) -> list[str]:
        response = client.get(
            f"{EUTILS_BASE}/esearch.fcgi",
            params={
                **self._common_params(),
                "term": query,
                "retmax": self._max_results,
                "sort": "relevance",
            },
        )
        response.raise_for_status()
        root = ET.fromstring(response.text)
        return [id_elem.text for id_elem in root.findall(".//IdList/Id") if id_elem.text]

    def _efetch(self, client: httpx.Client, pmids: list[str]) -> list[IngestedDocument]:
        if not pmids:
            return []
        response = client.get(
            f"{EUTILS_BASE}/efetch.fcgi",
            params={**self._common_params(), "id": ",".join(pmids), "rettype": "abstract"},
        )
        response.raise_for_status()
        root = ET.fromstring(response.text)

        documents: list[IngestedDocument] = []
        for article in root.findall(".//PubmedArticle"):
            pmid = article.findtext(".//PMID", default="")
            title = article.findtext(".//ArticleTitle", default="") or ""
            abstract_parts = [
                (elem.text or "") for elem in article.findall(".//Abstract/AbstractText")
            ]
            abstract = "\n\n".join(part for part in abstract_parts if part)
            if not abstract or not pmid:
                continue

            year = article.findtext(".//PubDate/Year")
            published_at = datetime(int(year), 1, 1) if year and year.isdigit() else None

            documents.append(
                IngestedDocument(
                    external_id=pmid,
                    title=title,
                    url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                    content=f"{title}\n\n{abstract}",
                    published_at=published_at,
                )
            )
        return documents

    def fetch(self) -> list[IngestedDocument]:
        documents: list[IngestedDocument] = []
        with httpx.Client(timeout=30.0) as client:
            for query in self._queries:
                pmids = self._esearch(client, query)
                time.sleep(self._min_interval)
                documents.extend(self._efetch(client, pmids))
                time.sleep(self._min_interval)
        return documents
