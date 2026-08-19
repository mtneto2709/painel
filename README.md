# clinical-rag-agent

Microserviço de agente de IA com RAG (Retrieval-Augmented Generation) para
apoio clínico, integrável ao **Sistema IS**. Cobre duas situações de uso:

1. **Situação 1** — análise retrospectiva do prontuário (e-SUS APS + Sistema
   IS), gerando um perfil clínico estruturado do paciente.
2. **Situação 2** — copiloto em tempo real durante o atendimento, sugerindo
   anamnese, diagnósticos diferenciais, exames, medicações e condutas.

Veja **[ARCHITECTURE.md](./ARCHITECTURE.md)** para o escopo completo: as
duas fontes de dados, a estratégia de baixo custo (crítica dado o volume de
milhares de atendimentos/dia), segurança/LGPD e o roadmap de implementação.

## Setup rápido

```bash
cp .env.example .env
# preencha .env: credenciais READ-ONLY de e-SUS e Sistema IS, ANTHROPIC_API_KEY,
# e a senha do banco próprio do serviço (APP_DB_PASSWORD)

python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

# sobe só a infra própria (banco de app com pgvector + redis) + o serviço
docker compose up -d app-db redis
alembic upgrade head

uvicorn app.main:app --reload --port 8080
```

Teste as conexões com os bancos clínicos assim que preencher o `.env`:

```bash
python scripts/test_db_connections.py
```

## Estrutura

```
app/
  config.py            # todas as variáveis de ambiente (.env)
  db/
    esus.py             # engine somente-leitura do e-SUS APS
    sistema_is.py        # engine somente-leitura do Sistema IS
    base.py, models.py   # banco próprio (cache, sessões, vetores, auditoria)
  repositories/          # queries SQL por fonte (placeholders até schema real)
  core/
    llm.py               # wrapper Anthropic (model tiering + prompt caching)
    embeddings.py         # embeddings locais (custo zero) ou Voyage AI
    costs.py              # tabela de preços e cálculo de custo por chamada
  rag/
    vector_store.py       # pgvector: upsert/busca por similaridade
    retriever.py           # orquestração de busca (nacional > internacional)
    ingestion/              # conectores por fonte (PCDT, PubMed, manual...)
  services/
    situacao1_profile.py    # perfil clínico com cache por hash do histórico
    situacao2_copilot.py     # sessão de consulta em tempo real (streaming)
  api/routes/               # endpoints REST/SSE
  workers/                  # job de pré-geração em lote (cron)
scripts/                    # CLIs: ingestão de fontes, teste de conexão
alembic/                    # migrações do banco próprio
```

## Integração com o Sistema IS

API REST versionada, autenticada por `X-API-Key` (`SERVICE_API_KEY` no
`.env`). Endpoints principais:

| Método | Rota | Situação |
|---|---|---|
| `GET` | `/v1/patients/{identity_value}/clinical-profile` | 1 — perfil clínico (cacheado) |
| `POST` | `/v1/consultations` | 2 — abre sessão de atendimento |
| `POST` | `/v1/consultations/{session_id}/turns` | 2 — envia turno, recebe sugestões via SSE |
| `POST` | `/v1/consultations/{session_id}/close` | 2 — encerra sessão |
| `GET` | `/health`, `/health/dependencies` | infra |
| `GET` | `/v1/admin/knowledge-base/stats`, `/v1/admin/llm-usage/summary` | observabilidade |

Documentação interativa (Swagger) disponível em `/docs` quando o serviço
está rodando.

## Ingestão da base de conhecimento (Fonte 2)

```bash
python scripts/ingest_sources.py --source pubmed --pubmed-query "hipertensão arterial tratamento"
python scripts/ingest_sources.py --source pcdt
python scripts/ingest_sources.py --source manual --manual-source-name rename --manual-file data/manual_sources/rename.json
```

Ver `data/manual_sources/README.md` para fontes sem API estável (RENAME,
WHO, NICE etc.).

## O que falta para ativar em produção

Ver ARCHITECTURE.md §8 — resumidamente: credenciais reais no `.env`, schema
real das duas bases (para completar `app/repositories/*.py`), e a definição
da chave de identidade do paciente entre e-SUS e Sistema IS.
