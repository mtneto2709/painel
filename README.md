# Consulta SIGTAP

Consulta moderna à **Tabela de Procedimentos, Medicamentos, Órteses, Próteses e Materiais Especiais do SUS** (Tabela Unificada / SIGTAP), com dados públicos do Ministério da Saúde / DATASUS.

HTML, CSS e JavaScript puro, sem build. O site funciona servido como arquivos estáticos; o
**Resumo de IA** precisa do servidor em Python incluído no projeto (veja abaixo).

```bash
python3 -m http.server 8000          # só o site, sem Resumo de IA
# abra http://localhost:8000
```

> Consulta independente e **não oficial**. Confirme sempre no [SIGTAP oficial](http://sigtap.datasus.gov.br/) antes de faturar.

## Funcionalidades

| Recurso do SIGTAP oficial | Nesta consulta |
| --- | --- |
| Consulta por grupo → subgrupo → forma de organização | Filtros em cascata + **árvore navegável** com contagens |
| Pesquisa por código ou nome | Busca instantânea, sem acentos, por código parcial (`03.01`, `0301010072`), com realce dos termos |
| Ficha do procedimento | Atributos, valores (SA, SH, SP, totais), modalidade, instrumento de registro, complexidade, financiamento, rubrica, sexo, idades, quantidade máxima, permanência, pontos |
| CID, CBO, habilitações, leitos, serviço/classificação | Abas na ficha com filtro local; páginas de CID e CBO listam os procedimentos relacionados |
| Compatibilidades e exceções | Aba na ficha + **verificador de compatibilidade** entre dois procedimentos |
| Regras condicionadas, incrementos, RENASES, TUSS, detalhes, origem, SIA/SIH, redes | Abas na ficha |
| Tabelas auxiliares | Financiamento, rubrica, complexidade, modalidade, instrumento de registro, serviços, habilitações, leitos, regras, RENASES, TUSS… cada item abre os procedimentos associados |
| Seleção de competência | Seletor de competência + **comparação entre competências** (incluídos, excluídos, valores alterados) |
| Relatórios | Exportação CSV (compatível com Excel pt-BR) e impressão / PDF em qualquer lista |
| — | **Busca rápida** (`Ctrl+K` ou `/`) por procedimento, CID, CBO e páginas |
| — | **Simulador de valores** (cesta ambulatorial ou hospitalar, com alerta de quantidade máxima) |
| — | **Comparação lado a lado** de até 4 procedimentos |
| — | Favoritos, histórico, links compartilháveis, tema claro/escuro, layout responsivo |

## Dados

Os arquivos ficam em `data/`:

```
data/manifest.json          competências disponíveis
data/AAAAMM/base.json       procedimentos + tabelas auxiliares
data/AAAAMM/cid.json        CID-10
data/AAAAMM/rel/GG.json     relacionamentos por grupo (carga completa)
```

Tudo é gerado por `scripts/sigtap_build.py` a partir do pacote mensal oficial
`TabelaUnificada_AAAAMM_vXXXX.zip` (`ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/`),
lendo os arquivos de largura fixa com os layouts publicados no próprio pacote:

```bash
python3 scripts/sigtap_build.py oficial                       # competência mais recente
python3 scripts/sigtap_build.py oficial --competencia 202610
python3 scripts/sigtap_build.py oficial --zip TabelaUnificada_202610_v2610101010.zip
SIGTAP_MANTER=6 python3 scripts/sigtap_build.py oficial       # mantém só as 6 últimas
```

### Competência incluída no repositório

A competência **08/2026** (`TabelaUnificada_202608_v2608141139.zip`) está incluída como **carga parcial**:
procedimentos, valores e tabelas auxiliares, extraídos do pacote oficial e redistribuídos nos pacotes npm
[`@br-health-kit/sigtap`](https://www.npmjs.com/package/@br-health-kit/sigtap) e
[`@br-health-kit/cid10`](https://www.npmjs.com/package/@br-health-kit/cid10) (MIT), gerada com
`scripts/sigtap_build.py seed`. Os relacionamentos (CID, CBO, habilitações, compatibilidades,
descrições etc.) e o sexo permitido aparecem depois da primeira carga oficial; até lá, o site avisa
onde eles faltam.

### Atualização automática

- `.github/workflows/atualizar-sigtap.yml` roda nos dias 5 e 20 de cada mês (ou manualmente,
  com competência opcional), baixa o pacote do FTP do DATASUS, gera os dados e faz commit.
- `.github/workflows/pages.yml` publica o site no GitHub Pages
  (ative em *Settings → Pages → Source: GitHub Actions*).

## Resumo de IA

Na ficha do procedimento, o botão **Resumo de IA** abre um resumo gerado pelo Claude: o que é o
procedimento, quando e como usar, quando não usar e por quê, erros comuns e falhas de
interpretação e casos de uso. O resumo é montado a partir da ficha oficial da competência
(atributos, descrição, CID, CBO, habilitações, leitos, compatibilidades e regras).

A seção **Atuação de vários profissionais** (se um registro cobre a equipe ou se cada profissional
ou CBO cobra por evento) só é pedida ao modelo quando o procedimento aceita ao menos duas profissões
de nível superior (CBO iniciados em 2; as famílias médicas contam como uma só) e não é exame,
medicamento ou OPM (grupos 02, 06 e 07). Hoje isso vale para cerca de 11% dos procedimentos.

Cada procedimento é gerado **uma única vez**: o resultado fica num banco SQLite e os pedidos
seguintes são servidos dele, sem gastar tokens. A resposta e a apresentação são idênticas nos dois
casos (verificações da ficha exibidas uma a uma e depois o resumo).

### Rodar localmente

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env     # o .env nunca vai para o git
.venv/bin/python scripts/servidor.py           # http://127.0.0.1:8000
```

### Publicação

O servidor (`scripts/servidor.py`) usa só a biblioteca padrão do Python 3.10+ e o SDK `anthropic`.
Ele serve apenas `index.html`, `assets/` e `data/` (exceto o banco), sem listagem de diretórios,
e a rota `POST /api/resumo`. Há um `Dockerfile` pronto:

```bash
docker build -t sigtap .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... -v sigtap-resumos:/var/lib/sigtap sigtap
```

| Variável | Padrão | Uso |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Chave da API da Anthropic. Sem ela, só os resumos já guardados são servidos. |
| `SIGTAP_HOST` / `SIGTAP_PORTA` | `127.0.0.1` / `8000` | Endereço e porta (no Docker, `0.0.0.0`). |
| `SIGTAP_RESUMOS_DB` | `data/resumos/resumos.sqlite3` | Banco de resumos; mantenha num volume persistente e faça backup. |
| `SIGTAP_IA_MODELO` | `claude-opus-5-5` | Modelo usado na geração. |
| `SIGTAP_IA_ESFORCO` | `high` | Profundidade do raciocínio: `low`, `medium`, `high`, `xhigh`, `max`. |
| `SIGTAP_IA_LIMITE_IP_HORA` | `20` | Novos resumos por IP por hora (`0` = sem limite). Resumos do banco não contam. |
| `SIGTAP_IA_LIMITE_DIA` | `500` | Novos resumos por dia no total (`0` = sem limite). |
| `SIGTAP_CONFIAR_PROXY` | — | `1` para usar `X-Forwarded-For` como IP do cliente (atrás de proxy reverso). |
| `SIGTAP_LOG` | `INFO` | Nível de log. Cada geração registra duração e tokens de entrada e saída. |

Custo de referência com `claude-opus-5-5`: cerca de 4,5 mil tokens de entrada e 4 mil de saída
por resumo (≈ US$ 0,10), gasto uma única vez por procedimento. Com vários processos ou réplicas,
use um único banco compartilhado (ou troque o SQLite por outro banco) para não gerar o mesmo
resumo duas vezes.

## Testes

```bash
python3 -m unittest discover -s tests
```

O teste monta um zip sintético no formato do DATASUS (dados + `_layout.txt`) e verifica a conversão.

## Estrutura

```
index.html              shell da aplicação
assets/css/app.css      estilos (tokens, tema escuro, responsivo, impressão)
assets/js/app.js        rotas e telas
assets/js/data.js       carregamento, busca, filtros e índices reversos
assets/js/ui.js         templates seguros, ícones, CSV, toasts
scripts/sigtap_build.py gerador de dados
scripts/servidor.py     servidor do site e do Resumo de IA
```
