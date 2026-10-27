#!/usr/bin/env python3
"""Servidor da Consulta SIGTAP com o Resumo de IA.

Serve o site estático (index.html, assets/ e data/) e a rota POST /api/resumo,
que devolve o resumo de IA de um procedimento. Cada resumo é gerado pelo Claude
uma única vez e guardado em SQLite; os pedidos seguintes saem do banco, sem
gastar tokens. A resposta tem sempre o mesmo formato (etapas de raciocínio +
resumo), seja o resumo recém-gerado ou lido do banco.

Uso:
    python scripts/servidor.py                 # http://127.0.0.1:8000

Configuração (variáveis de ambiente ou arquivo .env na raiz do projeto):
    ANTHROPIC_API_KEY        chave da API da Anthropic (obrigatória para gerar)
    SIGTAP_HOST              endereço de escuta (padrão 127.0.0.1)
    SIGTAP_PORTA             porta (padrão 8000)
    SIGTAP_RESUMOS_DB        arquivo SQLite (padrão data/resumos/resumos.sqlite3)
    SIGTAP_IA_MODELO         modelo (padrão claude-opus-5-5)
    SIGTAP_IA_ESFORCO        low | medium | high | xhigh | max (padrão high)
    SIGTAP_IA_LIMITE_IP_HORA novas gerações por IP por hora (padrão 20; 0 = sem limite)
    SIGTAP_IA_LIMITE_DIA     novas gerações por dia no total (padrão 500; 0 = sem limite)
    SIGTAP_CONFIAR_PROXY     1 para usar X-Forwarded-For como IP do cliente (atrás de proxy)
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import posixpath
import re
import sqlite3
import threading
import time
from collections import defaultdict, deque
from functools import lru_cache
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def load_dotenv(path: Path) -> None:
    """Lê KEY=valor de um .env sem sobrescrever o que já está no ambiente."""
    if not path.is_file():
        return
    for line in path.read_text("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip("'\""))


load_dotenv(ROOT / ".env")

HOST = os.environ.get("SIGTAP_HOST", "127.0.0.1")
PORTA = int(os.environ.get("SIGTAP_PORTA", "8000"))
DB_PATH = Path(os.environ.get("SIGTAP_RESUMOS_DB", DATA / "resumos" / "resumos.sqlite3"))
MODELO = os.environ.get("SIGTAP_IA_MODELO", "claude-opus-5-5")
ESFORCO = os.environ.get("SIGTAP_IA_ESFORCO", "high")
LIMITE_IP_HORA = int(os.environ.get("SIGTAP_IA_LIMITE_IP_HORA", "20"))
LIMITE_DIA = int(os.environ.get("SIGTAP_IA_LIMITE_DIA", "500"))
CONFIAR_PROXY = os.environ.get("SIGTAP_CONFIAR_PROXY") == "1"

# Só estes caminhos são servidos; .env, .venv, scripts/ e o banco ficam de fora.
PUBLICOS = ("/assets/", "/data/")
BLOQUEADOS = ("/data/resumos/",)

log = logging.getLogger("sigtap")


# --------------------------------------------------------------------------
# Dados da Tabela Unificada


@lru_cache(maxsize=1)
def manifest() -> dict:
    return json.loads((DATA / "manifest.json").read_text("utf-8"))


@lru_cache(maxsize=4)
def base(comp: str) -> dict:
    raw = json.loads((DATA / comp / "base.json").read_text("utf-8"))
    cols = raw["cols"]
    raw["procs"] = {r[0]: dict(zip(cols, r)) for r in raw.pop("procedimentos")}
    return raw


@lru_cache(maxsize=24)
def shard(comp: str, grupo: str) -> dict:
    path = DATA / comp / "rel" / f"{grupo}.json"
    return json.loads(path.read_text("utf-8")) if path.exists() else {}


@lru_cache(maxsize=4)
def cids(comp: str) -> dict:
    path = DATA / comp / "cid.json"
    return json.loads(path.read_text("utf-8")) if path.exists() else {}


COMPLEXIDADE = {0: "Não se aplica", 1: "Atenção Básica", 2: "Média Complexidade", 3: "Alta Complexidade"}
SEXO = {"M": "Masculino", "F": "Feminino", "I": "Ambos", "N": "Não se aplica"}
TIPO_COMPAT = {"1": "Compatível", "2": "Incompatível / excludente", "3": "Concomitante"}


# Grupos em que a seção multiprofissional não faz sentido: exames, medicamentos e OPM.
GRUPOS_SEM_MULTI = {"02", "06", "07"}
# Famílias CBO de médicos (contam como uma única profissão).
FAMILIAS_MEDICAS = {"2231", "2251", "2252", "2253"}


def multiprofissional(comp: str, co: str) -> bool:
    """Procedimento aceita ao menos duas profissões de nível superior (ex.: médico e enfermeiro)."""
    if co[:2] in GRUPOS_SEM_MULTI:
        return False
    profissoes = {
        "medico" if c[:4] in FAMILIAS_MEDICAS else c[:4]
        for c in shard(comp, co[:2]).get(co, {}).get("cbo", [])
        if c.startswith("2")
    }
    return len(profissoes) >= 2


def fmt_code(co: str) -> str:
    return f"{co[:2]}.{co[2:4]}.{co[4:6]}.{co[6:9]}-{co[9:]}"


def fmt_idade(meses):
    if meses is None:
        return "sem limite"
    plural = lambda n, um, varios: f"{n} {um if n == 1 else varios}"  # noqa: E731
    if meses < 12:
        return plural(meses, "mês", "meses")
    anos, m = divmod(meses, 12)
    return plural(anos, "ano", "anos") + (f" e {plural(m, 'mês', 'meses')}" if m else "")


def money(cents) -> str:
    return f"R$ {(cents or 0) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def contexto(comp: str, co: str) -> str | None:
    """Ficha do procedimento em texto, com os relacionamentos da competência."""
    b = base(comp)
    p = b["procs"].get(co)
    if not p:
        return None
    t = lambda tabela, k: (b.get(tabela) or {}).get(k) or k  # noqa: E731
    rel = shard(comp, co[:2]).get(co, {})
    cid_nomes = cids(comp)
    linhas = [
        f"Código: {fmt_code(co)}",
        f"Nome: {p['no']}",
        f"Competência: {comp[4:]}/{comp[:4]}",
        f"Grupo: {co[:2]} - {t('grupos', co[:2])}",
        f"Subgrupo: {co[:4]} - {t('subgrupos', co[:4])}",
        f"Forma de organização: {co[:6]} - {t('formas', co[:6])}",
        f"Complexidade: {COMPLEXIDADE.get(int(p['cx'] or 0), p['cx'])}",
        f"Financiamento: {t('financiamentos', p['fin']) if p['fin'] else 'não informado'}",
        f"Modalidades: {', '.join(t('modalidades', m) for m in p['mod']) or 'não informado'}",
        f"Instrumentos de registro: {', '.join(t('registros', r) for r in p['reg']) or 'não informado'}",
        f"Sexo: {SEXO.get(p['sx'], p['sx'])}",
        f"Idade mínima: {fmt_idade(p['idMin'])}; idade máxima: {fmt_idade(p['idMax'])}",
        f"Quantidade máxima: {p['qtMax'] if p['qtMax'] is not None else 'não informada'}",
        f"Média de permanência (dias): {p['dias'] if p['dias'] is not None else 'não se aplica'}",
        f"Pontos (rateio SP): {p['pts'] if p['pts'] is not None else 'não se aplica'}",
        f"Valores: SA {money(p['sa'])}; SH {money(p['sh'])}; SP {money(p['sp'])}",
    ]
    if rel.get("d"):
        desc = re.sub(r"\s*\|\|\s*", " ", rel["d"]).strip()
        linhas.append(f"Descrição oficial: {desc}")

    def lista(titulo, itens, limite=60):
        if not itens:
            return
        extra = f" (mostrando {limite} de {len(itens)})" if len(itens) > limite else ""
        linhas.append(f"\n{titulo}{extra}:")
        linhas.extend(f"- {i}" for i in itens[:limite])

    lista("CID-10 permitidos", [
        f"{c} - {(cid_nomes.get(c) or ['?'])[0]}{' (principal)' if pri else ' (secundário)'}"
        for c, pri in rel.get("cid", [])
    ])
    lista("Ocupações (CBO) que podem executar", [f"{c} - {t('ocupacoes', c)}" for c in rel.get("cbo", [])])
    lista("Habilitações exigidas", [f"{h[0]} - {t('habilitacoes', h[0])}" for h in rel.get("hab", [])])
    lista("Tipos de leito", [f"{l} - {t('leitos', l)}" for l in rel.get("lei", [])])
    lista("Serviço/classificação", [f"{s} - {t('classificacoes', s)}" for s in rel.get("srv", [])])
    lista("Procedimentos compatíveis", [
        f"{fmt_code(c[0])} - {(b['procs'].get(c[0]) or {}).get('no', '?')} ({TIPO_COMPAT.get(str(c[3]), c[3])})"
        for c in rel.get("cpt", [])
    ], 30)
    nome = lambda c: (b["procs"].get(c) or {}).get("no", "?")  # noqa: E731
    lista("Exceções de compatibilidade", [
        f"com {fmt_code(c[0])} ({nome(c[0])}), o compatível {fmt_code(c[1])} ({nome(c[1])}) passa a ser "
        f"{TIPO_COMPAT.get(str(c[4]), c[4]).lower()}"
        for c in rel.get("exc", [])
    ], 30)
    lista("Regras condicionadas", [
        f"{r} - {' — '.join(x for x in (b.get('regras') or {}).get(r, [r, '']) if x)}" for r in rel.get("rc", [])
    ])
    return "\n".join(linhas)


# --------------------------------------------------------------------------
# Banco de resumos


class Banco:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self._con() as con:
            con.execute(
                """CREATE TABLE IF NOT EXISTS resumos (
                     codigo TEXT PRIMARY KEY,
                     competencia TEXT NOT NULL,
                     modelo TEXT NOT NULL,
                     criado_em TEXT NOT NULL,
                     etapas TEXT NOT NULL,
                     resumo TEXT NOT NULL,
                     tokens_entrada INTEGER,
                     tokens_saida INTEGER
                   )"""
            )

    def _con(self):
        con = sqlite3.connect(self.path, timeout=30)
        con.execute("PRAGMA journal_mode=WAL")
        return con

    def get(self, co: str) -> dict | None:
        with self._con() as con:
            row = con.execute("SELECT etapas, resumo FROM resumos WHERE codigo = ?", (co,)).fetchone()
        return {"etapas": json.loads(row[0]), "resumo": json.loads(row[1])} if row else None

    def put(self, co: str, comp: str, etapas: list, resumo: dict, usage) -> None:
        with self._con() as con:
            con.execute(
                "INSERT OR REPLACE INTO resumos VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    co, comp, MODELO, dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                    json.dumps(etapas, ensure_ascii=False), json.dumps(resumo, ensure_ascii=False),
                    getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None),
                ),
            )


# --------------------------------------------------------------------------
# Geração com o Claude

SISTEMA = """Você é um especialista em faturamento e regulação do SUS, com domínio da Tabela de \
Procedimentos, Medicamentos e OPM (SIGTAP), dos sistemas SIA e SIH e das regras de registro em \
BPA, APAC e AIH.

Você recebe a ficha oficial de um procedimento da SIGTAP (atributos, descrição, CID, CBO, \
habilitações, leitos, compatibilidades e regras) e escreve um resumo prático para profissionais \
de saúde, faturistas e gestores.

Regras:
- Pense e escreva em português do Brasil, em linguagem clara e direta.
- Baseie-se na ficha recebida. Quando usar conhecimento geral sobre o SUS que não está na ficha, \
deixe isso claro no texto (por exemplo, "em geral" ou "costuma"). Nunca invente códigos, valores, \
portarias ou regras.
- Use os atributos da ficha para explicar restrições concretas: sexo, idade, quantidade máxima, \
CBO, CID, habilitação, leito e instrumento de registro.
- Os casos de uso devem ser situações clínicas e administrativas plausíveis e coerentes com a ficha.
- Não use markdown nos textos; cada item é uma frase ou um parágrafo curto.
- Em "verificacoes", liste de 4 a 7 conferências feitas na ficha para compor o resumo, cada uma \
com uma frase curta no gerúndio citando o dado concreto (por exemplo: "Conferindo a faixa etária \
permitida: até 1 mês de vida")."""

SISTEMA_MULTI = """
- Em "atuacao_multiprofissional", explique como fica a cobrança quando vários profissionais \
(médicos, enfermeiros, técnicos, fisioterapeutas etc.) atuam no mesmo atendimento: se um único \
registro do procedimento já remunera a equipe toda ou se cada profissional ou CBO pode registrar o \
procedimento por evento. Fundamente-se no instrumento de registro (BPA consolidado, BPA \
individualizado, APAC, AIH), na lista de CBO da ficha, na quantidade máxima e, na AIH, no rateio \
do serviço profissional (SP) por pontos. Dê situações concretas com a equipe envolvida e a regra \
de cobrança de cada uma; quando a resposta depender de norma local ou do gestor, diga isso."""

ESQUEMA = {
    "type": "object",
    "properties": {
        "verificacoes": {"type": "array", "items": {"type": "string"},
                         "description": "De 4 a 7 conferências feitas na ficha, frases curtas no gerúndio."},
        "o_que_e": {"type": "string", "description": "O que é o procedimento, em 2 a 4 frases."},
        "quando_usar": {"type": "array", "items": {"type": "string"},
                        "description": "Situações e indicações em que o procedimento deve ser registrado."},
        "como_usar": {"type": "array", "items": {"type": "string"},
                      "description": "Como registrar: instrumento, CID, CBO, quantidades, habilitação e leito."},
        "quando_nao_usar": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"situacao": {"type": "string"}, "motivo": {"type": "string"}},
                "required": ["situacao", "motivo"],
                "additionalProperties": False,
            },
        },
        "erros_comuns": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"erro": {"type": "string"}, "explicacao": {"type": "string"}},
                "required": ["erro", "explicacao"],
                "additionalProperties": False,
            },
        },
        "atuacao_multiprofissional": {
            "type": "object",
            "properties": {
                "regra_geral": {"type": "string",
                                "description": "Se um registro cobre a equipe toda ou se cada profissional/CBO registra por evento, e por quê."},
                "situacoes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "situacao": {"type": "string", "description": "Atendimento e profissionais envolvidos."},
                            "cobranca": {"type": "string", "description": "Como registrar e quem pode cobrar."},
                        },
                        "required": ["situacao", "cobranca"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["regra_geral", "situacoes"],
            "additionalProperties": False,
        },
        "casos_de_uso": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"titulo": {"type": "string"}, "descricao": {"type": "string"}},
                "required": ["titulo", "descricao"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["verificacoes", "o_que_e", "quando_usar", "como_usar", "quando_nao_usar", "erros_comuns", "atuacao_multiprofissional", "casos_de_uso"],
    "additionalProperties": False,
}


class IndisponivelError(Exception):
    """A geração não pode ser feita agora (sem chave, recusa, erro da API)."""


_client = None


def client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic()
    return _client


def gerar(comp: str, co: str, ficha: str) -> tuple[list, dict, object]:
    import anthropic

    multi = multiprofissional(comp, co)
    esquema = json.loads(json.dumps(ESQUEMA))
    if not multi:
        del esquema["properties"]["atuacao_multiprofissional"]
        esquema["required"].remove("atuacao_multiprofissional")

    try:
        with client().beta.messages.stream(
            model=MODELO,
            max_tokens=32000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": ESFORCO, "format": {"type": "json_schema", "schema": esquema}},
            system=SISTEMA + (SISTEMA_MULTI if multi else ""),
            messages=[{"role": "user", "content": f"Ficha do procedimento:\n\n{ficha}"}],
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise IndisponivelError("chave da API inválida ou ausente") from e
    except anthropic.RateLimitError as e:
        raise IndisponivelError("limite de requisições da API atingido") from e
    except anthropic.APIStatusError as e:
        raise IndisponivelError(f"erro da API ({e.status_code})") from e
    except anthropic.APIConnectionError as e:
        raise IndisponivelError("falha de conexão com a API") from e

    if msg.stop_reason == "refusal":
        cat = getattr(getattr(msg, "stop_details", None), "category", None)
        raise IndisponivelError(f"o modelo recusou a solicitação (categoria: {cat})")
    if msg.stop_reason == "max_tokens":
        raise IndisponivelError("resposta interrompida por limite de tokens")
    texto = next((b.text for b in msg.content if b.type == "text"), "")
    resumo = json.loads(texto)
    etapas = [e.strip() for e in resumo.pop("verificacoes", []) if e.strip()][:7] or [
        "Lendo a ficha oficial do procedimento",
        "Cruzando atributos com CID, CBO e regras de registro",
        "Organizando indicações, restrições e erros frequentes",
    ]
    return etapas, resumo, msg.usage


# --------------------------------------------------------------------------
# Limites de geração (só contam resumos novos; os do banco são livres)


class Limites:
    def __init__(self):
        self.lock = threading.Lock()
        self.por_ip = defaultdict(deque)
        self.dia = (dt.date.today(), 0)

    def permitir(self, ip: str) -> bool:
        agora = time.monotonic()
        with self.lock:
            hoje, n = self.dia
            if hoje != dt.date.today():
                hoje, n = dt.date.today(), 0
            fila = self.por_ip[ip]
            while fila and agora - fila[0] > 3600:
                fila.popleft()
            if (LIMITE_DIA and n >= LIMITE_DIA) or (LIMITE_IP_HORA and len(fila) >= LIMITE_IP_HORA):
                return False
            fila.append(agora)
            self.dia = (hoje, n + 1)
            return True

    def devolver(self, ip: str) -> None:
        with self.lock:
            if self.por_ip[ip]:
                self.por_ip[ip].pop()
            hoje, n = self.dia
            self.dia = (hoje, max(0, n - 1))


banco = Banco(DB_PATH)
limites = Limites()
_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()


def resumo_de(co: str, comp: str, ip: str) -> dict:
    hit = banco.get(co)
    if hit:
        log.info("resumo %s: banco", co)
        return hit
    with _locks_guard:
        lock = _locks[co]
    # Um único pedido gera o resumo; quem chega junto espera e lê do banco.
    with lock:
        hit = banco.get(co)
        if hit:
            return hit
        ficha = contexto(comp, co)
        if ficha is None:
            raise LookupError(co)
        if not limites.permitir(ip):
            raise IndisponivelError("limite de novos resumos atingido")
        inicio = time.monotonic()
        try:
            etapas, resumo, usage = gerar(comp, co, ficha)
        except Exception:
            limites.devolver(ip)
            raise
        banco.put(co, comp, etapas, resumo, usage)
        log.info(
            "resumo %s: gerado em %.1fs (%s tokens entrada, %s saída)",
            co, time.monotonic() - inicio, getattr(usage, "input_tokens", "?"), getattr(usage, "output_tokens", "?"),
        )
        return {"etapas": etapas, "resumo": resumo}


# --------------------------------------------------------------------------
# HTTP


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        log.debug("%s %s", self.address_string(), fmt % args)

    def _publico(self) -> bool:
        # Decodifica antes de validar: %72esumos não pode escapar de /data/resumos/.
        path = posixpath.normpath(unquote(self.path.split("?", 1)[0].split("#", 1)[0]))
        if path != "/" and self.path.split("?", 1)[0].endswith("/"):
            path += "/"
        if "/." in path or ".." in path or "\\" in path:
            return False
        if (path.rstrip("/") + "/").startswith(BLOQUEADOS):
            return False
        return path in ("/", "/index.html") or path.startswith(PUBLICOS)

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_GET(self):
        if not self._publico():
            return self.send_error(HTTPStatus.NOT_FOUND)
        return super().do_GET()

    def do_HEAD(self):
        if not self._publico():
            return self.send_error(HTTPStatus.NOT_FOUND)
        return super().do_HEAD()

    def _json(self, status: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _ip(self) -> str:
        if CONFIAR_PROXY and self.headers.get("X-Forwarded-For"):
            return self.headers["X-Forwarded-For"].split(",")[0].strip()
        return self.client_address[0]

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/resumo":
            return self.send_error(HTTPStatus.NOT_FOUND)
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
            pedido = json.loads(self.rfile.read(min(tamanho, 4096)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"erro": "Pedido inválido."})
        co = re.sub(r"\D", "", str(pedido.get("codigo", "")))
        comp = str(pedido.get("competencia") or manifest()["atual"])
        if len(co) != 10 or comp not in {c["id"] for c in manifest()["competencias"]}:
            return self._json(400, {"erro": "Pedido inválido."})
        try:
            return self._json(200, resumo_de(co, comp, self._ip()))
        except LookupError:
            return self._json(404, {"erro": "Procedimento não encontrado."})
        except IndisponivelError as e:
            log.warning("resumo %s indisponível: %s", co, e)
            return self._json(503, {"erro": "O resumo de IA não está disponível agora. Tente novamente mais tarde."})
        except Exception:  # noqa: BLE001 - nunca derrubar o servidor por um pedido
            log.exception("resumo %s: falha inesperada", co)
            return self._json(500, {"erro": "Não foi possível gerar o resumo."})


def main():
    logging.basicConfig(level=os.environ.get("SIGTAP_LOG", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        log.warning("ANTHROPIC_API_KEY não definida: só os resumos já guardados no banco serão servidos.")
    srv = ThreadingHTTPServer((HOST, PORTA), Handler)
    log.info("Consulta SIGTAP em http://%s:%d (modelo %s, banco %s)", HOST, PORTA, MODELO, DB_PATH)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
