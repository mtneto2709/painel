# Consulta SIGTAP — guia técnico de publicação

Guia para os times de desenvolvimento e DevOps publicarem a Consulta SIGTAP (Sistema IS) na
infraestrutura própria. Cobre arquitetura, requisitos, configuração, publicação com e sem Docker,
proxy reverso, atualização mensal dos dados, banco de resumos de IA, segurança, custos e
solução de problemas.

> Leitura mínima para subir em produção: seções 3, 4, 6 (ou 7), 8 e a checklist da seção 15.

---

## 1. Visão geral

A aplicação tem duas partes:

1. **Site** — HTML, CSS e JavaScript puro, sem etapa de build. Lê a Tabela Unificada do SUS a
   partir de arquivos JSON em `data/`, gerados do pacote oficial do DATASUS.
2. **Servidor** — `scripts/servidor.py` (Python 3.10+, biblioteca padrão + SDK `anthropic`).
   Serve o site e a rota `POST /api/resumo`, que entrega o **Resumo de IA** de um procedimento.

O Resumo de IA é gerado pelo Claude (Anthropic) **uma única vez por procedimento** e guardado num
banco SQLite. Os pedidos seguintes são lidos do banco, sem custo de tokens. Para o usuário, as
duas situações são idênticas na tela.

```
                 HTTPS                     HTTP (rede interna)
 Navegador  ─────────────▶  Proxy reverso  ─────────────────────▶  servidor.py :8000
                            (nginx, TLS)                           │  ├─ GET  /, /assets/*, /data/*   (arquivos)
                                                                   │  └─ POST /api/resumo
                                                                   │        │
                                                                   │        ├─ SQLite (volume persistente)
                                                                   │        └─ HTTPS ▶ api.anthropic.com
```

---

## 2. Conteúdo do pacote

```
index.html                  shell da aplicação
assets/                     CSS, JavaScript, logo e favicon
data/manifest.json          competências disponíveis (01 a 10/2026)
data/AAAAMM/                dados de cada competência (base.json, cid.json, rel/GG.json)
scripts/servidor.py         servidor do site e do Resumo de IA
scripts/sigtap_build.py     gerador dos dados a partir do FTP do DATASUS
requirements.txt            dependências Python do servidor
Dockerfile, .dockerignore   imagem de produção
tests/                      testes do gerador de dados
docs/PUBLICACAO.md          este guia
extras/resumos-iniciais.sqlite3   resumos de IA já gerados (opcional, ver seção 9.3)
.github/workflows/          automações usadas nos testes no GitHub (ver seção 10.3)
```

O pacote **não** contém o `.env` com a chave da API, o ambiente virtual `.venv` nem o banco de
resumos de desenvolvimento.

---

## 3. Requisitos

| Item | Requisito |
| --- | --- |
| Runtime | Docker 20+ **ou** Python 3.10+ (recomendado 3.12) |
| CPU / memória | 1 vCPU e 512 MB são suficientes; o processo carrega a competência em uso (~60 MB em memória) |
| Disco | ~80 MB para o código e os dados (10 competências) + banco de resumos (≈ 15 KB por resumo) |
| Rede de saída | HTTPS para `api.anthropic.com:443` (geração de resumos) |
| Rede de saída (só na atualização mensal) | FTP para `ftp2.datasus.gov.br` (porta 21, modo passivo) |
| Credencial | Chave da API da Anthropic (seção 4) |
| Proxy | nginx (ou equivalente) com TLS na frente do servidor |

---

## 4. Chave da API da Anthropic

1. Acesse **https://console.anthropic.com** com a conta da empresa.
2. Recomendado: crie um **workspace** só para este projeto (*Settings → Workspaces*). Assim o
   consumo fica separado e a chave pode ser trocada sem afetar outros projetos.
3. Em *Settings → API Keys → Create Key*, crie a chave no workspace do projeto
   (ex.: `sigtap-producao`). Ela começa com `sk-ant-` e só é exibida uma vez.
4. Em *Settings → Billing*, confirme que há créditos e **defina um limite mensal de gasto** para
   o workspace.
5. Guarde a chave no cofre de segredos da infraestrutura (Vault, secrets do Docker/Kubernetes,
   variáveis protegidas do CI). **Nunca** coloque a chave no código, na imagem ou no front-end.

A chave chega ao servidor pela variável de ambiente `ANTHROPIC_API_KEY`. Sem ela, o site
funciona normalmente e o servidor entrega só os resumos que já estão no banco; pedidos de resumo
novo recebem a mensagem "O resumo de IA não está disponível agora".

**Rotação:** crie a chave nova, atualize o segredo, reinicie o serviço e só então revogue a chave
antiga no Console.

---

## 5. Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Chave da API. Obrigatória para gerar resumos novos. |
| `SIGTAP_HOST` | `127.0.0.1` | Endereço de escuta. No Docker a imagem já usa `0.0.0.0`. |
| `SIGTAP_PORTA` | `8000` | Porta HTTP. |
| `SIGTAP_RESUMOS_DB` | `data/resumos/resumos.sqlite3` | Caminho do banco. No Docker: `/var/lib/sigtap/resumos.sqlite3`. |
| `SIGTAP_IA_MODELO` | `claude-opus-5-5` | Modelo usado na geração. |
| `SIGTAP_IA_ESFORCO` | `high` | Profundidade do raciocínio: `low`, `medium`, `high`, `xhigh`, `max`. |
| `SIGTAP_IA_LIMITE_IP_HORA` | `20` | Resumos **novos** por IP por hora (`0` desliga). Resumos do banco não contam. |
| `SIGTAP_IA_LIMITE_DIA` | `500` | Resumos **novos** por dia, somando todos os usuários (`0` desliga). |
| `SIGTAP_CONFIAR_PROXY` | — | `1` para usar o primeiro IP de `X-Forwarded-For` como IP do cliente. **Ligue atrás do proxy**, senão todos os usuários parecem vir do IP do proxy e dividem o mesmo limite. |
| `SIGTAP_LOG` | `INFO` | Nível de log (`DEBUG` também registra cada requisição HTTP). |

Em desenvolvimento, as variáveis podem ficar num arquivo `.env` na raiz do projeto
(`CHAVE=valor`, uma por linha). Valores já definidos no ambiente têm prioridade sobre o `.env`.

---

## 6. Publicação com Docker (recomendada)

### 6.1 Build

```bash
docker build -t sigtap:2026.10 .
```

A imagem (~365 MB) usa `python:3.12-slim`, roda como usuário `nobody`, expõe a porta 8000 e
guarda o banco em `/var/lib/sigtap` (declarado como volume).

### 6.2 Execução

```bash
docker run -d --name sigtap \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  -e ANTHROPIC_API_KEY \
  -e SIGTAP_CONFIAR_PROXY=1 \
  -v sigtap-resumos:/var/lib/sigtap \
  sigtap:2026.10
```

- `-e ANTHROPIC_API_KEY` sem valor repassa a variável do ambiente do host; prefira o mecanismo
  de segredos da sua orquestração.
- `-p 127.0.0.1:8000:8000` publica só para o host local; o acesso externo passa pelo proxy.
- O volume `sigtap-resumos` **precisa ser persistente**: é nele que ficam os resumos já pagos.

### 6.3 docker compose

```yaml
services:
  sigtap:
    image: sigtap:2026.10
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      SIGTAP_CONFIAR_PROXY: "1"
      SIGTAP_IA_LIMITE_IP_HORA: "20"
      SIGTAP_IA_LIMITE_DIA: "500"
    env_file:
      - /etc/sigtap/segredos.env      # contém ANTHROPIC_API_KEY=...
    volumes:
      - sigtap-resumos:/var/lib/sigtap
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/data/manifest.json', timeout=5)"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  sigtap-resumos:
```

### 6.4 Kubernetes (pontos de atenção)

- Use **uma réplica** (`replicas: 1`) com `strategy: Recreate`: o SQLite não deve ser
  compartilhado entre pods nem montado em NFS. Para várias réplicas, veja a seção 9.4.
- PersistentVolumeClaim `ReadWriteOnce` montado em `/var/lib/sigtap`.
- `ANTHROPIC_API_KEY` vinda de um `Secret`.
- Probes HTTP em `GET /data/manifest.json`.
- Timeout do Ingress de pelo menos 180 s para `/api/resumo` (seção 8).

---

## 7. Publicação sem Docker (systemd)

```bash
sudo useradd --system --home /opt/sigtap --shell /usr/sbin/nologin sigtap
sudo mkdir -p /opt/sigtap /var/lib/sigtap
sudo unzip sigtap-painel.zip -d /opt/sigtap
cd /opt/sigtap
sudo python3.12 -m venv .venv
sudo .venv/bin/pip install -r requirements.txt
sudo chown -R sigtap: /opt/sigtap /var/lib/sigtap
```

Segredo (permissão restrita):

```bash
sudo install -m 600 -o sigtap /dev/null /etc/sigtap.env
echo 'ANTHROPIC_API_KEY=sk-ant-...' | sudo tee /etc/sigtap.env > /dev/null
```

`/etc/systemd/system/sigtap.service`:

```ini
[Unit]
Description=Consulta SIGTAP (Sistema IS)
After=network-online.target
Wants=network-online.target

[Service]
User=sigtap
WorkingDirectory=/opt/sigtap
EnvironmentFile=/etc/sigtap.env
Environment=SIGTAP_HOST=127.0.0.1
Environment=SIGTAP_PORTA=8000
Environment=SIGTAP_RESUMOS_DB=/var/lib/sigtap/resumos.sqlite3
Environment=SIGTAP_CONFIAR_PROXY=1
ExecStart=/opt/sigtap/.venv/bin/python scripts/servidor.py
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/sigtap
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sigtap
journalctl -u sigtap -f
```

---

## 8. Proxy reverso (nginx)

O servidor Python é simples e não faz TLS nem compressão. Em produção ele deve ficar **sempre**
atrás de um proxy. A configuração recomendada deixa o nginx servir os arquivos estáticos
(mais rápido, com gzip e cache) e repassa ao Python só a rota da API:

```nginx
server {
    listen 443 ssl http2;
    server_name sigtap.suaempresa.com.br;

    ssl_certificate     /etc/ssl/sigtap/fullchain.pem;
    ssl_certificate_key /etc/ssl/sigtap/privkey.pem;

    root /opt/sigtap;                      # pasta do pacote (ou volume com os mesmos arquivos)

    gzip on;
    gzip_types application/json text/css application/javascript image/svg+xml;
    gzip_min_length 1024;

    # Arquivos públicos
    location = / { try_files /index.html =404; }
    location = /index.html { add_header Cache-Control "no-cache"; }
    location /assets/ { add_header Cache-Control "public, max-age=3600"; }
    location /data/   { add_header Cache-Control "public, max-age=3600"; }
    location /data/resumos/ { return 404; }

    # Resumo de IA
    location = /api/resumo {
        limit_req zone=sigtap_ia burst=5 nodelay;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;           # uma geração nova leva de 40 a 70 s
        client_max_body_size 4k;
    }

    # Todo o resto (scripts/, .env, README etc.) fica inacessível
    location / { return 404; }
}

# No bloco http {}:
# limit_req_zone $binary_remote_addr zone=sigtap_ia:10m rate=30r/m;
```

Pontos importantes:

- **`proxy_read_timeout` ≥ 180 s.** Gerar um resumo novo leva de 40 a 70 segundos. Com o padrão
  de 60 s do nginx, parte das gerações termina em erro 504 para o usuário, mesmo com o resumo
  sendo gravado no banco.
- **`SIGTAP_CONFIAR_PROXY=1`** no serviço, para os limites por IP funcionarem.
- Se o nginx servir os estáticos de outra pasta, lembre de atualizá-la junto com o container a
  cada atualização mensal (seção 10). Alternativa mais simples: repassar tudo ao Python
  (`location / { proxy_pass http://127.0.0.1:8000; }`); o servidor já bloqueia caminhos
  internos, mas não comprime os JSON (1 a 2 MB cada).

---

## 9. Banco de resumos (SQLite)

### 9.1 Estrutura

Tabela `resumos`, uma linha por procedimento:

| Coluna | Conteúdo |
| --- | --- |
| `codigo` | código do procedimento (10 dígitos, chave primária) |
| `competencia` | competência usada na geração (AAAAMM) |
| `modelo` | modelo que gerou |
| `criado_em` | data/hora UTC |
| `etapas` | JSON com as verificações exibidas antes do resumo |
| `resumo` | JSON com as seções do resumo |
| `tokens_entrada`, `tokens_saida` | consumo da geração |

O resumo é por **procedimento**, não por competência: uma vez gerado, vale para todas as
competências.

### 9.2 Backup

O banco é a única informação de estado da aplicação e representa custo já pago. Faça backup
diário com o comando `.backup` do SQLite (seguro com o serviço rodando):

```bash
sqlite3 /var/lib/sigtap/resumos.sqlite3 ".backup '/backup/sigtap/resumos-$(date +%F).sqlite3'"
# Docker: docker exec sigtap python -c "import sqlite3; s=sqlite3.connect('/var/lib/sigtap/resumos.sqlite3'); d=sqlite3.connect('/var/lib/sigtap/backup.sqlite3'); s.backup(d)"
```

Não copie só o arquivo `.sqlite3` com `cp` enquanto o serviço roda: o banco usa WAL e os
arquivos `-wal`/`-shm` fazem parte do estado.

### 9.3 Carga inicial (resumos já gerados)

`extras/resumos-iniciais.sqlite3` traz os resumos gerados durante o desenvolvimento. Para
aproveitá-los, copie o arquivo para o caminho de `SIGTAP_RESUMOS_DB` **antes da primeira
execução**:

```bash
# Docker (volume nomeado)
docker run --rm -v sigtap-resumos:/dest -v "$PWD/extras":/src alpine \
  sh -c "cp /src/resumos-iniciais.sqlite3 /dest/resumos.sqlite3 && chown 65534 /dest/resumos.sqlite3"

# systemd
sudo install -o sigtap -m 640 extras/resumos-iniciais.sqlite3 /var/lib/sigtap/resumos.sqlite3
```

### 9.4 Várias instâncias

O SQLite atende bem uma instância. Com várias réplicas, cada uma teria seu banco e o mesmo
resumo poderia ser gerado (e pago) mais de uma vez. Opções:

- manter uma única instância para `/api/resumo` (o restante pode ser servido pelo nginx/CDN);
- ou trocar a classe `Banco` em `scripts/servidor.py` por um banco compartilhado
  (PostgreSQL, por exemplo). A interface é pequena: `get(codigo)` e `put(...)`.

### 9.5 Consultas úteis

```bash
# quantos resumos e quanto consumiram
sqlite3 resumos.sqlite3 "SELECT count(*), sum(tokens_entrada), sum(tokens_saida) FROM resumos"

# regerar um resumo específico (o próximo pedido gera de novo, com custo)
sqlite3 resumos.sqlite3 "DELETE FROM resumos WHERE codigo = '0301010030'"
```

---

## 10. Atualização mensal da Tabela Unificada

O DATASUS publica um pacote por competência em `ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/`.

### 10.1 Gerar os dados

```bash
python3 scripts/sigtap_build.py oficial                       # competência mais recente
python3 scripts/sigtap_build.py oficial --competencia 202611  # competência específica
python3 -m unittest discover -s tests                         # testes do leitor
```

O script usa só a biblioteca padrão do Python (qualquer 3.9+), baixa o zip, converte e atualiza
`data/AAAAMM/` e `data/manifest.json`. A variável `SIGTAP_MANTER=N` mantém só as N competências
mais recentes e **apaga as anteriores**; sem ela, todas são mantidas. Hoje o pacote tem as 10
competências de 2026.

### 10.2 Publicar os dados novos

O servidor lê `manifest.json` e os dados **uma vez e guarda em memória**. Depois de atualizar
`data/`, é preciso **reiniciar o serviço** (ou publicar uma imagem nova) para a competência nova
aparecer no seletor e na geração de resumos.

Fluxo sugerido no CI da empresa (mensal, dias 5 e 20):

1. checkout do repositório;
2. `python3 scripts/sigtap_build.py oficial` + testes;
3. commit dos dados (opcional, para histórico);
4. `docker build` com tag da competência (ex.: `sigtap:2026.11`) e deploy;
5. o volume de resumos é mantido entre versões.

### 10.3 Workflows do GitHub incluídos

Usados só nos testes atuais no GitHub; podem servir de referência ou ser removidos:

- `atualizar-sigtap.yml` — atualização automática (dias 5 e 20). **Atenção:** está configurado
  com `SIGTAP_MANTER: "6"`, o que apagaria as competências de 01 a 04/2026 na próxima execução.
  Ajuste ou remova a variável se o objetivo for manter o ano inteiro.
- `pages.yml` — publicação no GitHub Pages (sem servidor, portanto sem Resumo de IA).

---

## 11. Resumo de IA: funcionamento

### 11.1 Fluxo

1. O navegador envia `POST /api/resumo` com `{"codigo": "0301010030", "competencia": "202610"}`.
2. O servidor valida o código e a competência contra os dados locais.
3. Se o resumo existe no banco, responde na hora.
4. Se não existe: monta a ficha do procedimento **a partir dos arquivos do servidor** (o
   navegador só envia o código), chama o Claude com saída em JSON estruturado, grava no banco e
   responde. Pedidos simultâneos do mesmo procedimento esperam a primeira geração e leem do banco
   (uma única chamada paga).
5. Resposta em ambos os casos: `{"etapas": [...], "resumo": {...}}`. O front-end exibe as etapas
   uma a uma com tempo mínimo e depois o resumo, sempre da mesma forma.

### 11.2 Conteúdo gerado

O que é; quando usar; como usar e registrar; quando não usar e por quê; erros comuns e falhas
de interpretação; casos de uso; e **atuação de vários profissionais** (se um registro cobre a
equipe ou se cada profissional/CBO cobra por evento). Esta última seção só é pedida ao modelo
quando o procedimento aceita ao menos duas profissões de nível superior (CBO iniciados em 2,
famílias médicas contam como uma) e não é dos grupos 02 (diagnóstico), 06 (medicamentos) ou
07 (OPM) — hoje cerca de 11% dos procedimentos.

Todo resumo exibe o aviso de que foi gerado por IA e deve ser conferido no SIGTAP oficial.

### 11.3 Onde ajustar

Em `scripts/servidor.py`:

- `SISTEMA` e `SISTEMA_MULTI` — instruções do modelo;
- `ESQUEMA` — campos e formato do resumo (alterações exigem ajuste em `resumoIA.render`, em
  `assets/js/app.js`);
- `contexto()` — o que entra na ficha enviada ao modelo;
- `multiprofissional()` — critério da seção de vários profissionais.

Mudanças no prompt não alteram resumos já gravados. Para aplicá-las, apague as linhas desejadas
do banco (seção 9.5).

### 11.4 Respostas de erro da API

| HTTP | Quando | Mensagem ao usuário |
| --- | --- | --- |
| 400 | código ou competência inválidos | "Pedido inválido." |
| 404 | procedimento inexistente na competência | "Procedimento não encontrado." |
| 503 | sem chave, limite atingido, recusa do modelo, erro ou indisponibilidade da API | "O resumo de IA não está disponível agora. Tente novamente mais tarde." |
| 500 | falha inesperada (registrada com traceback no log) | "Não foi possível gerar o resumo." |

---

## 12. Custos

Medição real com `claude-opus-5-5` (US$ 4 por milhão de tokens de entrada, US$ 20 por milhão de
saída):

| | Por resumo |
| --- | --- |
| Tokens de entrada | 3,9 mil a 5,1 mil |
| Tokens de saída | 3,8 mil a 4,9 mil |
| Custo | ≈ US$ 0,08 a 0,12 |
| Tempo | 40 a 70 s |

O custo acontece **uma única vez por procedimento**. Referência de teto: os ~1.000
procedimentos mais consultados custariam cerca de US$ 100 no total; a tabela inteira
(5.039 procedimentos), cerca de US$ 500.

Controles disponíveis: limite mensal de gasto no Console da Anthropic, `SIGTAP_IA_LIMITE_DIA`,
`SIGTAP_IA_LIMITE_IP_HORA` e `limit_req` no nginx. Para baratear, `SIGTAP_IA_MODELO` e
`SIGTAP_IA_ESFORCO` podem ser alterados sem mudar código (avalie a qualidade antes).

---

## 13. Segurança

- **Arquivos servidos:** apenas `/`, `/index.html`, `/assets/*` e `/data/*`, exceto
  `/data/resumos/*`. Sem listagem de diretórios. Caminhos com `..`, arquivos ocultos e variações
  codificadas (`%2e`, `%72`…) são recusados. Validado: `.env`, `scripts/`, `.venv`, `.git` e o
  banco retornam 404.
- **Chave da API:** só no servidor, via variável de ambiente; nunca vai para o navegador, a
  imagem ou o repositório (`.env` está no `.gitignore` e no `.dockerignore`).
- **API sem autenticação:** `/api/resumo` é pública como o site. O abuso é contido pelos limites
  de geração (só resumos novos contam) e pelo `limit_req` do nginx. Se o site for interno,
  restrinja o acesso no proxy (VPN, SSO, lista de IPs).
- **Entrada do usuário:** o corpo é limitado a 4 KB; só o código (10 dígitos) e a competência
  (lista do manifest) são aceitos. Nenhum texto do usuário vai para o modelo.
- **Saída do modelo:** renderizada com escape de HTML no front-end (sem `innerHTML` de texto do
  modelo).
- **Container:** roda como `nobody`; o único diretório gravável necessário é `/var/lib/sigtap`.

---

## 14. Logs e monitoramento

O servidor escreve em stdout/stderr (capturado pelo Docker ou pelo journald):

```
INFO Consulta SIGTAP em http://0.0.0.0:8000 (modelo claude-opus-5-5, banco /var/lib/sigtap/resumos.sqlite3)
INFO resumo 0301010030: banco
INFO resumo 0301060096: gerado em 51.0s (3989 tokens entrada, 4799 saída)
WARNING resumo 0301010056 indisponível: ANTHROPIC_API_KEY não definida
ERROR resumo ...: falha inesperada   (com traceback)
```

Sugestões de alerta: qualquer `ERROR`; `WARNING ... indisponível` acima do normal;
soma diária de tokens (a partir dos logs ou da tabela `resumos`); erros 504 no nginx em
`/api/resumo` (timeout do proxy baixo).

Health check: `GET /data/manifest.json` deve responder 200.

---

## 15. Checklist de go-live

- [ ] Chave criada num workspace próprio, com limite mensal de gasto, guardada no cofre de segredos
- [ ] Saída HTTPS liberada para `api.anthropic.com`
- [ ] Container/serviço rodando com `ANTHROPIC_API_KEY` e `SIGTAP_CONFIAR_PROXY=1`
- [ ] Volume persistente em `/var/lib/sigtap` (e carga inicial da seção 9.3, se desejado)
- [ ] nginx com TLS, `proxy_read_timeout 180s` em `/api/resumo`, gzip e `limit_req`
- [ ] `https://.../.env`, `https://.../scripts/servidor.py` e `https://.../data/resumos/` retornam 404
- [ ] Site abre, troca de competência funciona, busca e ficha do procedimento carregam
- [ ] Resumo de IA de um procedimento novo é gerado (40–70 s) e reaberto em seguida sai do banco
- [ ] Backup diário do banco configurado e testado (restauração)
- [ ] Rotina mensal de atualização de dados + reinício/novo deploy definida
- [ ] `SIGTAP_MANTER` revisado no processo de atualização (seção 10)
- [ ] Alertas de log configurados

---

## 16. Solução de problemas

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| Botão mostra "não está disponível neste ambiente" | site servido sem o servidor Python (ex.: GitHub Pages ou `python -m http.server`) | servir com `scripts/servidor.py` ou repassar `/api/resumo` a ele |
| "não está disponível agora" para todo resumo novo | `ANTHROPIC_API_KEY` ausente ou inválida | ver o `WARNING` no log; conferir o segredo e reiniciar |
| Idem, só às vezes | limite por IP/dia atingido, recusa do modelo ou instabilidade da API | o motivo está no `WARNING` do log; ajustar limites se for o caso |
| Todos os usuários atingem o limite juntos | `SIGTAP_CONFIAR_PROXY` desligado atrás do proxy | definir `SIGTAP_CONFIAR_PROXY=1` |
| Erro 504 na geração, mas o resumo aparece ao tentar de novo | `proxy_read_timeout` baixo | aumentar para 180 s |
| Competência nova não aparece | serviço não reiniciado após atualizar `data/` | reiniciar ou publicar imagem nova |
| `PermissionError` ou `unable to open database file` | volume sem permissão de escrita para `nobody`/`sigtap` | `chown` do diretório do banco |
| `TypeError: Could not resolve authentication method` em versões antigas do pacote | sem chave | já tratado nesta versão (responde 503) |

---

## 17. Desenvolvimento local

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
printf 'ANTHROPIC_API_KEY=sk-ant-...\n' > .env    # nunca commitar
.venv/bin/python scripts/servidor.py            # http://127.0.0.1:8000
```

Sem o servidor, `python3 -m http.server 8000` serve só o site (sem Resumo de IA).
