# painel-esus-sync

Worker que substitui o mecanismo de **triggers + dblink** hoje usado no banco
de dados do e-SUS para acionar o painel de chamada de pacientes do Sistema IS.

## Por que este projeto existe

Hoje o e-SUS possui uma trigger em `public.tb_atend` que, ao detectar uma
mudança de status do atendimento (de `AGUARDANDO` para `EM_ESCUTA_INICIAL`
ou `EM_ATENDIMENTO`), monta um JSON com os dados do atendimento e usa
`dblink` para chamar `sotech.esus_criar_chamada` diretamente no banco do IS.

Isso exige que o usuário de acesso ao e-SUS tenha permissão de **escrita**
(para criar a tabela `sy_conexao`, as funções e a trigger). Por motivos de
segurança, o acesso ao e-SUS passará a ser **somente leitura**.

Este worker reproduz o mesmo resultado sem precisar de nenhuma escrita, nem
de qualquer objeto novo, no banco do e-SUS:

1. Faz *polling* periódico e somente leitura em `public.tb_atend`, procurando
   as mesmas transições de status que a trigger observava.
2. Ao detectar uma transição válida, executa a mesma consulta que
   `public.tb_atend_chamar` fazia, para montar o mesmo payload de dados
   (paciente, profissional, unidade, etc.).
3. Envia esse payload para o banco do IS chamando a função **já existente**
   `sotech.esus_criar_chamada`, sem alterar nenhuma estrutura do IS. Essa
   função continua responsável por: criar o paciente se não existir, criar o
   atendimento no IS e inserir a chamada no painel — exatamente como hoje.

Nenhuma tabela, função ou trigger nova é criada em nenhum dos dois bancos.
O único estado próprio da aplicação (watermark de polling, cache do último
status conhecido de cada atendimento e log de auditoria) fica em um arquivo
SQLite local, privado do worker.

## Arquitetura

```
                 leitura (READ ONLY)              chama função existente
   ┌──────────┐  polling a cada N seg   ┌────────┐  sotech.esus_criar_chamada  ┌────────┐
   │  e-SUS   │ ───────────────────────▶│ worker │ ───────────────────────────▶│   IS   │
   │ (origem) │                         │ Node.js│                             │(destino)│
   └──────────┘                         └───┬────┘                             └────────┘
                                             │
                                             ▼
                                     data/state.db (SQLite)
                                     watermark + cache de status + log
```

### Detecção de transição sem trigger

A trigger original disparava em `AFTER UPDATE` quando `old.st_atend = 1` e
`new.st_atend in (2, 3)`. Sem trigger, não existe "OLD" — por isso o worker
mantém, no SQLite local, o último status conhecido de cada atendimento e
compara com o status lido a cada ciclo. A mesma regra (`1 -> 2 ou 3`) é
aplicada para decidir se a chamada deve ser enviada.

O `watermark` (última `dt_ultima_alteracao_status` processada com sucesso)
evita reler o histórico inteiro do e-SUS a cada ciclo — só se busca o que
mudou desde a última execução.

### Consistência e retomada após falhas

Dentro de um ciclo, as linhas são processadas em ordem cronológica. Se o
envio ao IS falhar para uma linha (rede, banco fora do ar, etc.), o ciclo é
interrompido **sem avançar o watermark** além do último ponto processado com
sucesso — a próxima execução tentará novamente a partir daquele ponto. Isso
garante *at-least-once delivery* das chamadas.

## Pré-requisitos de acesso aos bancos

- **e-SUS**: usuário com permissão apenas de `SELECT` nas tabelas
  `public.tb_atend`, `public.tb_atend_prof`, `public.tb_status_atend`,
  `public.tb_unidade_saude`, `public.tb_prontuario`, `public.tb_cidadao`,
  `public.tb_lotacao`, `public.tb_prof`, `public.tb_cbo`,
  `public.tb_tipo_atend_prof`. O worker ainda força `SET
  default_transaction_read_only = on` em cada conexão, como proteção extra.
- **IS**: usuário com permissão de `EXECUTE` na função
  `sotech.esus_criar_chamada` e de leitura/escrita nas tabelas que ela já
  utiliza internamente (`sotech.cdg_unidadesaude`, `sotech.cdg_setor`,
  `sotech.rel_unidade_setor`, `sotech.cdg_interveniente`,
  `sotech.tbn_especialidade`, `ish.sys_usuario`, `sotech.ate_consultorio`,
  `sotech.mid_tv`, `sotech.ate_checkin`, `sotech.cdg_paciente`,
  `sotech.ate_atendimento`, `sotech.ate_chamada`, `sotech.tbl_sexo`) — as
  mesmas permissões que o usuário `dblink` do e-SUS já precisava ter hoje.

## Configuração

```bash
cp .env.example .env
# preencha ESUS_DB_* e IS_DB_* com as credenciais reais
```

Variáveis principais (ver `.env.example` para a lista completa):

| Variável | Descrição |
|---|---|
| `ESUS_DB_*` | Conexão somente leitura ao e-SUS |
| `IS_DB_*` | Conexão de escrita ao IS |
| `POLL_INTERVAL_MS` | Intervalo entre ciclos de polling (padrão 5000ms) |
| `POLL_BATCH_SIZE` | Máximo de mudanças de status por ciclo (padrão 200) |
| `SYNC_DRY_RUN` | Se `true`, loga a chamada que seria feita mas não grava no IS |
| `STATE_DB_PATH` | Caminho do SQLite de estado interno |

## Execução local

```bash
npm install
npm run dev        # com ts-node-dev, recarrega ao alterar o código
```

## Execução com Docker

```bash
docker compose up --build -d
docker compose logs -f
```

O container expõe `GET /health` na porta `HEALTH_PORT` (padrão 3000), usado
pelo `HEALTHCHECK` do Dockerfile e para monitoramento externo.

## Plano de corte (cutover) recomendado

1. Configure as credenciais somente leitura do e-SUS e as credenciais do IS
   no `.env`.
2. Suba o worker com `SYNC_DRY_RUN=true` e acompanhe os logs / a tabela
   `event_log` do SQLite por um período (ex.: um dia inteiro de operação),
   comparando as chamadas que *seriam* geradas com as chamadas reais que a
   trigger antiga está gerando.
3. Validado o comportamento, desative a trigger antiga no e-SUS
   (`alter table public.tb_atend disable trigger public_tb_atend_chamada;`)
   ou revogue a permissão de escrita do usuário do e-SUS.
4. Coloque o worker em produção com `SYNC_DRY_RUN=false`.
5. Depois de confirmar operação estável, as funções, a trigger e a tabela
   `sy_conexao` no e-SUS podem ser removidas — este worker não depende mais
   delas.

## Observabilidade

- Logs estruturados (`pino`), nível configurável via `LOG_LEVEL`.
- Auditoria de cada decisão (chamada enviada, ignorada por falta de
  profissional, erro, ou dry-run) na tabela `event_log` do SQLite local.
- `GET /health` retorna o horário do último ciclo e o último erro, se houver.
