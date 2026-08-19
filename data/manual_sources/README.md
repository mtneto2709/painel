# Fontes de ingestão manual

Arquivos JSON nesta pasta alimentam o `ManualSourceIngestor`
(`app/rag/ingestion/manual_source_ingestor.py`) para fontes sem API estável
(RENAME, WHO Guidelines, NICE, Cadernos de Atenção Básica, resoluções CFM,
bulários ANVISA...).

Formato de cada arquivo (`<fonte>.json`):

```json
[
  {
    "external_id": "rename-2024",
    "title": "RENAME 2024 — Relação Nacional de Medicamentos Essenciais",
    "url": "https://www.gov.br/saude/.../rename-2024.pdf"
  }
]
```

Rodar: `python scripts/ingest_sources.py --source manual --manual-source-name rename --manual-file data/manual_sources/rename.json`

Veja `example.json` como modelo.
