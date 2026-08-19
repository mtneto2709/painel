"""Ingestor dos PCDT (Protocolos Clínicos e Diretrizes Terapêuticas) do
Ministério da Saúde, via Portal de Dados Abertos do SUS.

Fonte: https://dadosabertos.saude.gov.br/dataset/pcdt-protocolos-clinicos-e-diretrizes-terapeuticas
O portal é um CKAN — usamos a API `package_show` para listar os recursos
(normalmente PDFs) e extraímos o texto para indexação.

Nota: portais de dados abertos mudam de layout/dataset id com alguma
frequência. Se `package_show` retornar vazio, confirme o `dataset_id` atual
navegando o portal e ajuste `DATASET_ID` abaixo.
"""

from __future__ import annotations

import io

import httpx

from app.config import get_settings
from app.rag.ingestion.base import BaseIngestor, IngestedDocument

DATASET_ID = "pcdt-protocolos-clinicos-e-diretrizes-terapeuticas"


class PCDTIngestor(BaseIngestor):
    source = "pcdt"

    def __init__(self) -> None:
        self._base_url = get_settings().dadosabertos_saude_base_url

    def _list_resources(self, client: httpx.Client) -> list[dict]:
        response = client.get(
            f"{self._base_url}/api/3/action/package_show", params={"id": DATASET_ID}
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            return []
        return payload["result"].get("resources", [])

    @staticmethod
    def _extract_pdf_text(content: bytes) -> str:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)

    def fetch(self) -> list[IngestedDocument]:
        documents: list[IngestedDocument] = []
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            resources = self._list_resources(client)
            for resource in resources:
                url = resource.get("url")
                fmt = (resource.get("format") or "").lower()
                if not url or fmt != "pdf":
                    continue  # outros formatos (planilhas de metadados etc.) ficam para uma v2

                try:
                    file_response = client.get(url)
                    file_response.raise_for_status()
                    text = self._extract_pdf_text(file_response.content)
                except Exception:
                    continue  # PDF ilegível/indisponível — não interrompe os demais

                if not text.strip():
                    continue

                documents.append(
                    IngestedDocument(
                        external_id=resource["id"],
                        title=resource.get("name") or "PCDT sem título",
                        url=url,
                        content=text,
                    )
                )
        return documents
