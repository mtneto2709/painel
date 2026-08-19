# Arquitetura — Agente RAG de Apoio Clínico (Microserviço `clinical-rag-agent`)

## 1. Objetivo

Microserviço independente, integrável ao Sistema IS (aplicação principal do painel),
que fornece um agente de IA com RAG (Retrieval-Augmented Generation) para apoiar
profissionais de saúde em dois momentos distintos do atendimento, otimizado para
**baixíssimo custo por interação**, já que o volume esperado é de milhares de
atendimentos/dia por dezenas/centenas de profissionais simultâneos.

O serviço nunca escreve nos bancos de origem (e-SUS APS e Sistema IS): toda a
leitura clínica é feita por usuários de banco **somente-leitura**, dedicados e
auditáveis. O serviço só escreve em seu **próprio banco** (cache de perfis,
memória vetorial, sessões de atendimento, auditoria/custos).

## 2. As duas situações de uso

### Situação 1 — Análise retrospectiva do prontuário (assíncrona / pré-consulta)

- **Gatilho:** agendamento da consulta, abertura do prontuário pelo profissional,
  ou job noturno em lote para os pacientes com consulta marcada no dia seguinte.
- **Entrada:** histórico completo do paciente nas duas fontes (e-SUS APS + Sistema IS):
  atendimentos anteriores, diagnósticos (CID-10/CIAP2), medicações em uso,
  exames, alergias, vacinação, condições crônicas, evolução de sinais vitais.
- **Processo:**
  1. Extração estruturada (SQL, não LLM) do histórico relevante das duas fontes.
  2. Normalização/deduplicação em um "paciente unificado" (resolução de identidade
     por CPF/CNS entre e-SUS e Sistema IS).
  3. Um passo de LLM barato (Haiku) sinaliza tópicos que merecem checagem em
     literatura médica (ex.: "paciente diabético + IECA + K+ alto recorrente" →
     buscar diretriz de hipercalemia).
  4. RAG na base de conhecimento médico-científico **apenas para os tópicos
     sinalizados** (não para o prontuário inteiro — ver seção 5, otimização de custo).
  5. Síntese final (Sonnet) gera o **relatório estruturado do perfil do paciente**
     (JSON + texto), citando as fontes (registros do prontuário e/ou diretrizes).
  6. Resultado é **persistido em cache** no banco do microserviço, versionado por
     "hash do histórico" — só é regerado quando há atendimento novo desde a
     última geração.
- **Saída:** relatório estruturado (ver `app/schemas/patient_profile.py`):
  resumo clínico, linha do tempo de problemas ativos/resolvidos, medicações em
  uso e possíveis interações, alergias, alertas (ex. exames vencidos, condutas
  pendentes), pontos de atenção para a próxima consulta.
- **Custo:** um LLM call "caro" por paciente por *evento clínico novo* (não por
  acesso). Suporta Batches API (assíncrono, ~50% mais barato) quando disparado
  em lote (ex.: pacientes da agenda do dia seguinte).

### Situação 2 — Copiloto em tempo real durante o atendimento

- **Gatilho:** consulta em andamento; profissional e/ou paciente alimentam o
  sistema (queixa, anamnese parcial, achados de exame físico, hipóteses).
- **Entrada:** perfil da Situação 1 (já pronto em cache — **reaproveitado, não
  recalculado**) + texto incremental da consulta atual.
- **Processo:**
  1. Cada novo trecho de informação da consulta é classificado por um modelo
     barato (Haiku) para decidir *se* dispara nova busca (RAG) — evita chamar
     o pipeline completo a cada tecla/frase.
  2. Quando necessário, RAG busca literatura relevante às hipóteses diagnósticas
     correntes (diretrizes de diagnóstico/tratamento, bulários, interações
     medicamentosas).
  3. O contexto fixo da sessão (perfil do paciente, system prompt, diretrizes já
     recuperadas) é enviado com **prompt caching** — apenas o incremento da
     conversa é "novo" a cada chamada.
  4. Sonnet gera sugestões incrementais: perguntas de anamnese ainda não feitas,
     diagnósticos diferenciais (com racional e nível de evidência), exames
     sugeridos, opções terapêuticas/medicações (checadas contra alergias e
     interações do próprio paciente), condutas.
  5. Resposta é **sempre apoio à decisão**, nunca prescrição automática — o
     profissional decide; o serviço registra a sugestão e a decisão final para
     auditoria e aprendizado do produto.
- **Saída:** sugestões incrementais (streaming) exibidas na UI do Sistema IS.
- **Custo:** sessão de consulta = poucas chamadas Sonnet (com cache hit alto,
  pois o prefixo — perfil do paciente + diretrizes — se repete a cada turno)
  intercaladas com chamadas Haiku muito mais baratas para roteamento/triagem.

## 3. As duas fontes de dados

### Fonte 1 — Bases de dados do paciente (read-only)

| Fonte | Conteúdo | Acesso |
|---|---|---|
| **e-SUS APS** (PostgreSQL) | Prontuário Eletrônico do Cidadão da Atenção Primária (SUS): atendimentos, CIAP2/CID-10, procedimentos, vacinação, territorialização | Usuário Postgres dedicado, `SELECT`-only, sem acesso a tabelas de auditoria/senhas |
| **Sistema IS** (PostgreSQL, aplicação própria) | Prontuário eletrônico complementar/privado, histórico de atendimentos, exames, prescrições | Usuário Postgres dedicado, `SELECT`-only |

Ambas as conexões usam um usuário de banco criado especificamente para o
microserviço, com privilégios `GRANT SELECT` (nunca `INSERT/UPDATE/DELETE/DDL`),
`statement_timeout` curto e, quando possível, via réplica de leitura — para
nunca competir com a carga transacional do sistema principal. O código também
força `SET default_transaction_read_only = on` na conexão como segunda camada
de proteção (`app/db/esus.py`, `app/db/sistema_is.py`).

### Fonte 2 — Literatura médico-científica validada

Priorizamos fontes **gratuitas/abertas** (custo zero de licenciamento) e com
alta aceitação clínica, com foco em protocolos **brasileiros/SUS** (compatíveis
com e-SUS) complementados por evidência internacional:

**Brasil / SUS (prioridade 1 — o e-SUS é um sistema do SUS, então a conduta
sugerida deve estar alinhada às diretrizes oficiais):**
- **PCDT — Protocolos Clínicos e Diretrizes Terapêuticas** (Ministério da
  Saúde/CONITEC) — [dadosabertos.saude.gov.br](https://dadosabertos.saude.gov.br/dataset/pcdt-protocolos-clinicos-e-diretrizes-terapeuticas)
- **RENAME** — Relação Nacional de Medicamentos Essenciais
- **Cadernos de Atenção Básica** e Protocolos de Enfermagem (Ministério da Saúde)
- Diretrizes de sociedades de especialidade (SBC — cardiologia, SBD — diabetes,
  SBP — pediatria, FEBRASGO — ginecologia/obstetrícia)
- **CFM** — resoluções sobre conduta médica
- **ANVISA** — bulários (bula eletrônica), alertas de segurança de medicamentos
- **BVS/BIREME e SciELO** — literatura científica em português (LILACS)

**Internacional (prioridade 2 — evidência ampliada, principalmente quando não
há PCDT nacional para a condição):**
- **PubMed/MEDLINE** via NCBI E-utilities — gratuito, sem chave obrigatória
  ([documentação](https://www.ncbi.nlm.nih.gov/books/NBK25497/))
- **OMS/WHO Guidelines** — gratuito
- **NICE Guidelines** (Reino Unido) — gratuito, referência mundial em custo-efetividade
- **ClinicalTrials.gov** — gratuito
- **openFDA / RxNorm (NLM)** — segurança de medicamentos e interações, gratuito
- *(Fase 2, opcional e sujeito a orçamento)* **Cochrane Library**, **UpToDate**,
  **DynaMed** — assinaturas pagas, alta qualidade, avaliar ROI antes de contratar

A ingestão é feita por conectores plugáveis (`app/rag/ingestion/*_ingestor.py`),
versionados e reexecutáveis (idempotentes), guardando a fonte/URL/data de
publicação de cada trecho para **citação rastreável** em toda sugestão do agente.

## 4. Arquitetura técnica

```
                         ┌──────────────────────────┐
                         │   Sistema IS (frontend)   │
                         └─────────────┬─────────────┘
                                        │ REST/SSE (API key / mTLS)
                         ┌─────────────▼─────────────┐
                         │  clinical-rag-agent (FastAPI) │
                         │  ┌───────────────────────┐ │
                         │  │ Situação 1: Profile    │ │
                         │  │ Situação 2: Copilot    │ │
                         │  └───────────────────────┘ │
                         └───┬───────────┬────────────┘
             read-only SQL   │           │  read-only SQL
        ┌─────────────────┐ │           │ ┌──────────────────┐
        │  e-SUS APS (PG) │◄┘           └►│ Sistema IS DB(PG) │
        └─────────────────┘               └──────────────────┘
                         │
                         │ leitura/escrita (banco próprio do serviço)
                         ▼
        ┌───────────────────────────────────────────┐
        │ app DB (Postgres + pgvector)               │
        │  - patient_profile_cache                   │
        │  - consultation_sessions                   │
        │  - document_chunks (embeddings, fontes)     │
        │  - audit_log / llm_usage (custo por chamada)│
        └───────────────────────────────────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │ Anthropic Claude API │  Haiku 4.5 (roteamento/extração)
              │ (com prompt caching) │  Sonnet 5 (síntese/raciocínio clínico)
              └────────────────────┘
```

- **Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (engines síncronos/assíncronos
  separados por fonte), pgvector para memória vetorial (reaproveita o Postgres,
  sem serviço extra), Redis opcional para cache de resposta de curtíssimo prazo
  e filas de background.
- **Empacotamento:** Docker + docker-compose para o banco próprio e o serviço;
  e-SUS e Sistema IS são bancos **externos** (não sobem no compose — apenas
  configurados via `.env`).
- **Integração com o Sistema IS:** API REST versionada (`/v1/...`) autenticada
  por API key/JWT de serviço, endpoints síncronos para Situação 1 (consulta de
  relatório já cacheado) e streaming SSE para Situação 2. Fácil de chamar de
  qualquer stack (PHP, Java, Node etc.) sem acoplamento de linguagem.

## 5. Estratégia de baixo custo (financeiro e de tokens)

Este é o requisito mais crítico dado o volume (milhares de atendimentos/dia).
Camadas de otimização, da mais para a menos impactante:

1. **Cache agressivo do resultado, não só do prompt.** O relatório da Situação 1
   só é recalculado quando o histórico do paciente muda (novo atendimento/exame
   registrado) — controlado por hash de versão. A maioria dos acessos ao perfil
   é *leitura de cache*, custo zero de LLM.
2. **Prompt caching da Anthropic** (`cache_control` em blocos ≥1024 tokens):
   system prompt, perfil do paciente e diretrizes recuperadas são marcados como
   cacheáveis. Em uma sessão de atendimento (Situação 2), o mesmo prefixo se
   repete a cada novo turno — reduz custo de *input* em 60–90%.
3. **Roteamento por modelo (model tiering).** Tarefas mecânicas (classificar se
   uma busca é necessária, extrair entidades, resumir uma linha do tempo) usam
   **Haiku 4.5** (muito mais barato); apenas a síntese clínica final e o
   raciocínio diagnóstico usam **Sonnet 5**.
4. **RAG seletivo, não exaustivo.** Busca na base de literatura só é disparada
   quando um passo barato de triagem identifica necessidade real — evita
   embutir diretrizes irrelevantes em todo prompt.
5. **Extração estruturada antes do LLM.** O histórico do prontuário é resumido
   via SQL/regras para JSON compacto (poucas centenas de tokens) antes de
   chegar ao modelo — nunca despejamos linhas de banco cruas no prompt.
6. **Embeddings locais (custo marginal zero).** Geração de embeddings via
   modelo local (`sentence-transformers`, multilíngue/PT-BR) tanto na ingestão
   da literatura quanto — mais importante — em cada busca de um profissional,
   que senão seria uma chamada de API paga *por atendimento*. Isso é o maior
   driver de custo em escala, por isso a escolha por padrão é rodar em CPU/GPU
   própria, com Voyage AI como opção plugável de maior qualidade se o
   orçamento permitir no futuro.
7. **Anthropic Message Batches API** para a geração assíncrona em lote da
   Situação 1 (ex.: pré-processar agenda do dia seguinte à noite) — desconto
   adicional sobre o preço padrão.
8. **Limites e streaming.** `max_tokens` conservador por tipo de chamada,
   respostas em streaming (melhora percepção de latência sem aumentar custo) e
   *circuit breakers* de orçamento diário/por clínica.
9. **Observabilidade de custo desde o dia 1.** Toda chamada ao LLM grava tokens
   de entrada/saída/cache e custo estimado em `llm_usage` (app DB), permitindo
   dashboards de custo por profissional/unidade/tipo de situação.

## 6. Segurança, privacidade e compliance (LGPD)

- Dados de saúde são dado sensível (LGPD art. 5º, II) — minimização é regra:
  só se extrai do prontuário o necessário para a tarefa.
- Conexões somente-leitura, credenciais próprias, sem persistência de dado
  clínico bruto fora do necessário para cache (e com TTL/expurgo).
- Toda chamada ao LLM e toda sugestão exibida ao profissional fica registrada
  em `audit_log` (rastreabilidade clínica e para revisão de qualidade do
  agente).
- Nenhuma sugestão é aplicada automaticamente ao prontuário — o serviço é
  consultivo; a ação final é sempre humana.
- Avaliar, antes de produção, se o provedor de LLM usado atende aos requisitos
  contratuais de tratamento de dados de saúde (DPA, região de processamento).

## 7. Roadmap de implementação

| Fase | Entregável |
|---|---|
| **0 — Fundação (este commit)** | Scaffold do microserviço, conexões read-only, `.env` de credenciais, esqueleto RAG, endpoints REST, docker-compose |
| **1 — Conectar dados reais** | Mapear schema real de e-SUS e Sistema IS nos repositories; testar extração estruturada |
| **2 — Ingestão de conhecimento** | Rodar ingestores das fontes gratuitas (PCDT, RENAME, WHO, PubMed) e popular `document_chunks` |
| **3 — Situação 1 end-to-end** | Job de pré-geração de perfil, cache, endpoint de consulta, validação clínica com equipe médica |
| **4 — Situação 2 end-to-end** | Fluxo de sessão de consulta em tempo real, streaming, testes com profissionais piloto |
| **5 — Observabilidade de custo e hardening** | Dashboards de uso/custo, rate limiting, revisão de segurança, LGPD |
| **6 — Fontes pagas (opcional)** | Avaliar Cochrane/UpToDate/DynaMed conforme orçamento e necessidade clínica |

## 8. O que falta para ativar (depende de você)

1. Preencher `.env` com host/porta/usuário/senha **read-only** dos dois bancos
   (e-SUS APS e Sistema IS) e a `ANTHROPIC_API_KEY`.
2. Compartilhar o schema (nomes de tabelas/colunas) das duas bases para que eu
   implemente as queries reais em `app/repositories/esus_repository.py` e
   `app/repositories/sistema_is_repository.py` (hoje contêm exemplos/placeholders
   documentados).
3. Definir a chave de resolução de identidade do paciente entre as duas bases
   (CPF? CNS? ID interno mapeado?).
4. Decidir quais fontes pagas (se alguma) entram na Fase 6.
