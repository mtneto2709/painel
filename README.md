# Consulta SIGTAP

Consulta moderna à **Tabela de Procedimentos, Medicamentos, Órteses, Próteses e Materiais Especiais do SUS** (Tabela Unificada / SIGTAP), com dados públicos do Ministério da Saúde / DATASUS.

Site estático (HTML, CSS e JavaScript puro, sem build): é só servir a pasta.

```bash
python3 -m http.server 8000
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
```
