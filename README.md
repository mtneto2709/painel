# AtendValida

Microserviço multi-tenant, independente, para **validar/comprovar que um atendimento de saúde
realmente aconteceu**, capturando a confirmação do paciente por um de três métodos
intercambiáveis, escolhidos por tenant (e opcionalmente por tipo de procedimento):

1. **Token via WhatsApp/SMS** — totalmente funcional nesta versão.
2. **Assinatura em tela** (touchscreen/tablet/mesa digitalizadora) — contrato de API, modelo de
   dados e tela de captura completos; o provedor de armazenamento/validação da assinatura está
   propositalmente *stubado* (retorna `503` com a mensagem `"Método de assinatura em tela ainda
   não configurado para esta unidade."`).
3. **Biometria facial** — mesmo tratamento: schema, contrato de API, tela de captura com
   consentimento LGPD e tela de configuração no admin completos; a chamada real ao provedor de
   biometria (AWS Rekognition / Azure Face / Unico / Idwall...) está abstraída atrás de uma
   interface e propositalmente *stubada*.

O AtendValida **não tem UI própria voltada ao SaaS cliente** — ele expõe apenas:

- Uma **API REST** (`/v1/...`), para integração backend-to-backend do SaaS contratante.
- Um **app de captura** (React), embutido via iframe/webview/redirect, onde o paciente digita o
  token, assina em tela ou faz a captura facial.
- Um **painel administrativo** (React), para o tenant (unidade de saúde) configurar métodos,
  credenciais, webhook e consultar o histórico de validações.

## Sumário

- [Arquitetura e decisões técnicas](#arquitetura-e-decisões-técnicas)
- [Estrutura do monorepo](#estrutura-do-monorepo)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Contrato de API (resumo)](#contrato-de-api-resumo)
- [Segurança](#segurança)
- [Conformidade com a LGPD](#conformidade-com-a-lgpd)
- [Testes](#testes)
- [Ativando assinatura em tela / biometria facial de verdade](#ativando-assinatura-em-tela--biometria-facial-de-verdade)

## Arquitetura e decisões técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Framework backend | **NestJS** (Express) | Modularidade e injeção de dependência nativas facilitam isolar os módulos de tenants, validações, comprovantes, webhooks e os *providers* stubados de assinatura/biometria. |
| ORM | **Prisma** | Migrations declarativas, tipagem gerada automaticamente e client type-safe reduzem erro humano no acesso multi-tenant. |
| Fila assíncrona | **BullMQ** (sobre Redis) | Envio de OTP, geração de PDF e entrega de webhooks (com retry/backoff) rodam fora do ciclo de request/response. |
| Autenticação SaaS→API | **Client credentials** (`api_key_id` + `api_secret` trocados por JWT de 15 min) | Simples de integrar por um backend, sem necessidade de fluxo interativo OAuth completo. |
| Front-ends | **Dois apps React separados** (`capture-app` e `admin-panel`), cada um com Vite próprio | O app de captura roda no navegador do paciente (embutido pelo SaaS) e precisa ser mínimo e rápido; o painel admin é uma ferramenta interna do tenant, com necessidades de navegação e formulários distintas. Separar evita que o bundle do paciente carregue código do painel admin (e vice-versa). |
| Validação de dados | **class-validator + class-transformer** | Integração nativa com o `ValidationPipe` do NestJS (Zod foi considerado, mas exigiria uma camada extra de adaptação nos DTOs decorados do Swagger). |
| Assinatura de comprovantes | **Ed25519** (módulo `crypto` nativo do Node) | Assinatura assimétrica rápida e moderna, sem dependências externas. |
| Criptografia em repouso | **AES-256-GCM local**, abstraída atrás de uma interface `KmsProvider` | Permite trocar a implementação por AWS KMS/Vault em produção sem alterar os módulos que a consomem. |

**Sobre o método de token (WhatsApp/SMS):** a *lógica* de geração, expiração, tentativas e
confirmação do código é 100% real e funcional. O *envio* efetivo da mensagem usa um adaptador
(`NotificacaoAdapter`) — por padrão, um `ConsoleNotificacaoAdapter` que apenas registra a
mensagem no log estruturado, já que este projeto não inclui credenciais de nenhum provedor real.
Para produção, implemente a interface com a WhatsApp Business API (Meta Cloud API) e/ou um
gateway de SMS e troque o binding em `NotificacaoModule` — nenhuma mudança de schema ou de API é
necessária.

## Estrutura do monorepo

```
atendvalida/
├── apps/
│   ├── api/                # API NestJS (REST /v1, filas, Prisma, autenticação)
│   ├── capture-app/        # App de captura (paciente) — React + Vite
│   └── admin-panel/        # Painel administrativo do tenant — React + Vite
├── packages/
│   └── shared-types/       # DTOs/enums TypeScript compartilhados entre back e front
├── docker-compose.yml
├── .env.example
└── README.md
```

Gerenciado com **pnpm workspaces**. Scripts úteis na raiz:

```bash
pnpm install          # instala tudo
pnpm dev:api          # sobe a API em modo watch
pnpm dev:capture       # sobe o app de captura (Vite)
pnpm dev:admin         # sobe o painel admin (Vite)
pnpm build             # builda todos os pacotes/apps
pnpm test              # roda os testes da API
```

## Como rodar localmente

### Opção A — Docker Compose (recomendado)

```bash
cp .env.example .env
# edite .env: gere JWT_SECRET, KMS_LOCAL_KEY, OPERATOR_TOKEN e ED25519_PRIVATE_KEY
# (comandos de geração estão comentados dentro do próprio .env.example)

docker compose up --build
```

Isso sobe Postgres, Redis, a API (`:3000`), o app de captura (`:5173`) e o painel admin
(`:5174`). Na primeira subida, a API aplica as migrations automaticamente
(`prisma migrate deploy`). Para popular dados de exemplo (tenant + paciente de teste):

```bash
docker compose exec api pnpm prisma:seed
```

O comando imprime `api_key_id` e `api_secret` do tenant de demonstração — use-os para logar no
painel admin (`http://localhost:5174`) ou para chamar a API diretamente.

### Opção B — sem Docker (Postgres/Redis locais)

```bash
pnpm install
cp .env.example apps/api/.env   # ajuste DATABASE_URL/REDIS_URL para localhost

cd apps/api
pnpm exec prisma migrate dev
pnpm prisma:seed
pnpm dev            # API em http://localhost:3000

# em outro terminal
cd apps/capture-app && pnpm dev   # http://localhost:5173
cd apps/admin-panel && pnpm dev   # http://localhost:5174
```

### Documentação interativa da API

Com a API no ar, a especificação OpenAPI/Swagger fica em **`http://localhost:3000/docs`**.

## Variáveis de ambiente

Todas as variáveis estão documentadas (em pt-BR) em [`.env.example`](./.env.example), incluindo
os comandos para gerar `JWT_SECRET`, `KMS_LOCAL_KEY` e o par de chaves `ED25519_PRIVATE_KEY`.

## Contrato de API (resumo)

Base path: `/v1`. Ver o Swagger (`/docs`) para o contrato completo, incluindo schemas de request/
response.

**Autenticação**
- `POST /v1/auth/token` — troca `api_key_id` + `api_secret` por um JWT de 15 min.

**Configuração (tenant, autenticado)**
- `POST /v1/tenants` — cria tenant (protegido por token de operador, uso interno/onboarding).
- `GET /v1/tenants/:id/metodos` — lista métodos e status ativo/configurado.
- `PUT /v1/tenants/:id/metodos/:metodo` — ativa/configura um método (credenciais criptografadas).
- `POST /v1/tenants/:id/rotate-api-key` — rotaciona o `api_secret` (uso interno).
- `PUT|GET /v1/tenants/:id/webhook`, `POST /v1/tenants/:id/webhook/testar`.

**Execução (chamado pelo SaaS / app de captura)**
- `POST /v1/validacoes` — cria uma validação. Se o método não estiver ativo, retorna `422` com
  `status: "metodo_nao_configurado"` e a lista de métodos disponíveis.
- `GET /v1/validacoes` — histórico paginado do tenant (filtros: `status`, `metodo`, `data_inicio`,
  `data_fim`).
- `GET /v1/validacoes/:id` — status + comprovante (se concluído).
- `POST /v1/validacoes/:id/token/confirmar` — confirma o código OTP.
- `POST /v1/validacoes/:id/reenviar` — expira o código atual e envia um novo (rate limited).
- `POST /v1/validacoes/:id/consentimento` — registra consentimento LGPD (obrigatório antes da
  biometria).
- `POST /v1/validacoes/:id/assinatura` — envia a assinatura (retorna `503` enquanto stubado).
- `POST /v1/validacoes/:id/biometria` — envia a captura facial (retorna `503` enquanto stubado;
  exige consentimento prévio).

**Comprovantes**
- `GET /v1/comprovantes/:id`, `GET /v1/comprovantes/:id/pdf`
- `GET /v1/comprovantes/:id/verificar` — endpoint **público** que recalcula o hash e confere a
  assinatura Ed25519, para verificação de autenticidade por terceiros.

**Webhooks**
- Eventos `validacao.confirmada`, `validacao.expirada`, `validacao.rejeitada`, assinados via
  HMAC-SHA256 no header `assinatura_webhook`, com retry exponencial (BullMQ, até 5 tentativas).

> **Nota sobre autenticação do app de captura:** os endpoints acessados diretamente pelo
> paciente (`GET /v1/validacoes/:id`, confirmação de token, envio de assinatura/biometria,
> reenvio, consentimento) **não exigem o JWT do tenant** — a posse do `validacao_id` (um UUID
> v4 não-adivinhável, de vida curta e com rate limiting por tentativa) funciona como *capability
> token*, no mesmo espírito de um `client_secret` de sessão de checkout. Isso é necessário porque
> o navegador do paciente nunca tem acesso às credenciais do tenant.

## Segurança

- **TLS**: assumido na camada de ingress/load balancer à frente deste serviço. Este repositório
  não implementa TLS na própria aplicação.
- **Criptografia em repouso**: telefones de pacientes, segredos de webhook e credenciais de
  provedores são criptografados (AES-256-GCM) antes de irem ao banco, via `KmsProvider`. A
  implementação padrão (`LocalKmsProvider`) usa uma chave de ambiente — troque por uma
  implementação que fale com AWS KMS/Vault/GCP KMS em produção (mesma interface).
- **Rate limiting**: via Redis, por tenant/paciente/IP, em criação de validação, confirmação de
  OTP e reenvio.
- **Mascaramento de logs**: CPF, telefone e imagens (biometria/assinatura) nunca são logados em
  claro — os campos são explicitamente redigidos na configuração do logger (`pino`) e
  mascarados nas respostas de configuração dos métodos.
- **Comprovantes tamper-evident**: hash SHA-256 do payload canônico + assinatura Ed25519,
  verificável via `GET /v1/comprovantes/:id/verificar`.
- **Auditoria append-only**: `auditoria_log` guarda um hash encadeado ao registro anterior
  (hash chain simples) para detectar adulteração retroativa dos logs de auditoria.

## Conformidade com a LGPD

- **Base legal por método**:
  - *Token via WhatsApp/SMS*: execução de contrato/procedimento preparatório, já que o dado
    tratado (telefone) é fornecido pelo próprio SaaS contratante como parte da prestação do
    serviço de saúde.
  - *Assinatura em tela*: execução de contrato — a assinatura é evidência de manifestação de
    vontade do titular sobre o atendimento prestado.
  - *Biometria facial*: **consentimento explícito e específico** (art. 7º, I e art. 11, I da
    LGPD), por se tratar de dado biométrico — dado pessoal sensível. Por isso o backend
    **bloqueia** (`403`) qualquer tentativa de captura biométrica sem um registro prévio em
    `consentimentos`, mesmo com o método ainda em modo stub.
- **Retenção de dados (sugestão)**: comprovantes e metadados de validação — mínimo de 5 anos
  (alinhado a prazos prescricionais cíveis comuns na área de saúde); imagens de biometria facial,
  quando o método for ativado de verdade, devem ter retenção reduzida ao estritamente necessário
  para a verificação (recomenda-se descartar a imagem bruta após o matching, mantendo apenas o
  resultado da verificação no comprovante). Ajuste conforme a política de retenção definida pelo
  DPO de cada tenant.
- **DPIA/RIPD**: antes de ativar a biometria facial em produção (trocar o stub por uma
  implementação real), é **obrigatório** realizar um Relatório de Impacto à Proteção de Dados
  Pessoais (RIPD/DPIA), dado o alto risco associado ao tratamento de dados biométricos em escala.
  Este repositório não substitui essa análise.
- **Minimização de dados**: o `paciente.cpf_hash` é recebido já hasheado pelo SaaS chamador — o
  AtendValida nunca armazena CPF em claro.

## Testes

```bash
cd apps/api
pnpm test          # unitários: OTP, assinatura Ed25519, resolução de config de métodos, etc.
pnpm test:e2e       # integração: fluxo completo de criação/confirmação de validação via HTTP
```

Os testes de integração (`test:e2e`) exigem Postgres e Redis acessíveis (ver
`test/env-setup.ts` — usa `atendvalida_test` como banco e o índice 1 do Redis, para não
disputar filas com uma API rodando em paralelo em desenvolvimento).

## Ativando assinatura em tela / biometria facial de verdade

O objetivo do design é que ativar qualquer um dos dois métodos stubados seja **apenas a
implementação de uma classe adapter + a configuração de credenciais no admin**, sem qualquer
mudança de schema ou de contrato de API:

1. Implemente `AssinaturaProvider`/`BiometriaProvider` (em
   `apps/api/src/validacoes/providers/`) com a chamada real ao provedor escolhido, lendo as
   credenciais de `tenant_validation_methods.configuracao` (já vêm descriptografadas via
   `TenantsService.descriptografarConfig`).
2. Troque o binding do provider correspondente no `ValidacoesModule`.
3. No painel admin, cadastre as credenciais reais na tela de configuração do método — o badge
   passa de "não configurado" para "configurado" automaticamente.

---

_Assunções documentadas neste projeto: autenticação client-credentials simplificada (sem OAuth2
completo), provider de notificação de OTP em modo console/log para desenvolvimento local, e
armazenamento de PDFs em disco local (trocar por bucket de objetos em produção)._
