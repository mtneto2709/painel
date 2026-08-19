#!/usr/bin/env python
"""CLI de ingestão da base de conhecimento (Fonte 2 — literatura médica).

Exemplos:
    python scripts/ingest_sources.py --source pcdt
    python scripts/ingest_sources.py --source pubmed --pubmed-query "diabetes mellitus tipo 2 tratamento"
    python scripts/ingest_sources.py --source manual --manual-file data/manual_sources/rename.json

Ver `app/rag/ingestion/` para os ingestores disponíveis e
`ARCHITECTURE.md §3` para a lista de fontes recomendadas.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.base import get_app_sessionmaker  # noqa: E402
from app.rag.ingestion.manual_source_ingestor import ManualSourceIngestor  # noqa: E402
from app.rag.ingestion.pcdt_ingestor import PCDTIngestor  # noqa: E402
from app.rag.ingestion.pubmed_ingestor import PubMedIngestor  # noqa: E402

logger = logging.getLogger("ingest_sources")

DEFAULT_PUBMED_QUERIES = [
    "hipertensão arterial sistêmica tratamento atenção primária",
    "diabetes mellitus tipo 2 manejo clínico",
    "insuficiência cardíaca diagnóstico tratamento",
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=["pcdt", "pubmed", "manual"], required=True)
    parser.add_argument("--pubmed-query", action="append", dest="pubmed_queries")
    parser.add_argument("--manual-file", type=Path)
    parser.add_argument("--manual-source-name", default="manual")
    args = parser.parse_args()

    logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(message)s")

    session = get_app_sessionmaker()()
    try:
        if args.source == "pcdt":
            count = PCDTIngestor().run(session)
        elif args.source == "pubmed":
            queries = args.pubmed_queries or DEFAULT_PUBMED_QUERIES
            count = PubMedIngestor(queries=queries).run(session)
        elif args.source == "manual":
            if not args.manual_file:
                parser.error("--manual-file é obrigatório para --source manual")
            documents = json.loads(args.manual_file.read_text(encoding="utf-8"))
            count = ManualSourceIngestor(source=args.manual_source_name, documents=documents).run(session)
        else:  # pragma: no cover
            raise ValueError(args.source)

        logger.info("Ingestão concluída: %d documentos processados (fonte=%s)", count, args.source)
    finally:
        session.close()


if __name__ == "__main__":
    main()
