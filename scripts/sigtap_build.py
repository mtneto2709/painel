#!/usr/bin/env python3
"""Gera os dados consumidos pelo site a partir da Tabela Unificada do SIGTAP.

Fontes suportadas:

  oficial  Pacote mensal publicado pelo DATASUS
           (ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/).
           Inclui todos os relacionamentos: CID, CBO, habilitações, leitos,
           serviços/classificações, compatibilidades, regras condicionadas,
           RENASES, TUSS, incrementos, descrições etc.

  seed     Tabelas já extraídas do mesmo pacote e redistribuídas nos pacotes
           npm @br-health-kit/sigtap e @br-health-kit/cid10 (MIT). Contém
           procedimentos, valores e tabelas auxiliares, mas não os
           relacionamentos. Útil quando o FTP do DATASUS não está acessível.

Exemplos:

  python3 scripts/sigtap_build.py oficial                    # baixa a competência mais recente
  python3 scripts/sigtap_build.py oficial --competencia 202610
  python3 scripts/sigtap_build.py oficial --zip TabelaUnificada_202610_v2610101010.zip
  python3 scripts/sigtap_build.py seed --sigtap DIR --cid DIR

A saída vai para data/<AAAAMM>/ e data/manifest.json é atualizado.
Defina SIGTAP_MANTER=N para manter apenas as N competências mais recentes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import ftplib
import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("SIGTAP_DATA_DIR", ROOT / "data")).resolve()

FTP_HOST = "ftp2.datasus.gov.br"
FTP_DIR = "/pub/sistemas/tup/downloads"

# Colunas de cada procedimento em base.json (ordem fixa, lida pelo front-end).
PROC_COLS = [
    "co", "no", "cx", "sx", "qtMax", "dias", "pts", "idMin", "idMax",
    "sh", "sa", "sp", "fin", "rub", "tPerm", "mod", "reg",
]

SENTINELS = {9999, 99999}


# --------------------------------------------------------------------------
# Utilidades


def log(*args):
    print(*args, file=sys.stderr)


def to_int(value):
    value = (value or "").strip()
    if not value or not re.fullmatch(r"-?\d+", value):
        return None
    return int(value)


def qty(value):
    """Quantidades/idades com sentinelas de 'sem limite' viram null."""
    n = to_int(value)
    return None if n is None or n in SENTINELS else n


def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def write_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(compact(obj), encoding="utf-8")
    log(f"  {path}  {path.stat().st_size / 1024:,.0f} KB")


def label(comp: str) -> str:
    return f"{comp[4:6]}/{comp[:4]}"


# --------------------------------------------------------------------------
# Leitura do pacote oficial (largura fixa, guiada pelos arquivos *_layout.txt)


class Package:
    """Acesso às tabelas de um TabelaUnificada_AAAAMM_*.zip."""

    def __init__(self, zip_bytes: bytes):
        self.zip = zipfile.ZipFile(io.BytesIO(zip_bytes))
        self.names = {Path(n).name.lower(): n for n in self.zip.namelist()}

    def has(self, table: str) -> bool:
        return f"{table}.txt" in self.names

    def _layout(self, table: str):
        raw = self.zip.read(self.names[f"{table}_layout.txt"]).decode("latin-1")
        cols = []
        for line in raw.splitlines()[1:]:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 4 or not parts[0]:
                continue
            name, size, start, end = parts[0], int(parts[1]), int(parts[2]), int(parts[3])
            if end - start + 1 != size:
                raise ValueError(f"layout inconsistente em {table}: {line}")
            cols.append((name.upper(), start - 1, end))
        return cols

    def rows(self, table: str):
        if not self.has(table):
            log(f"  aviso: {table} ausente no pacote")
            return []
        cols = self._layout(table)
        raw = self.zip.read(self.names[f"{table}.txt"]).decode("latin-1")
        out = []
        for line in raw.splitlines():
            if not line.strip():
                continue
            out.append({name: line[a:b].strip() for name, a, b in cols})
        return out


def ftp_latest(competencia: str | None) -> tuple[str, bytes]:
    log(f"Conectando a {FTP_HOST}{FTP_DIR} ...")
    ftp = ftplib.FTP(FTP_HOST, timeout=120)
    ftp.login()
    ftp.cwd(FTP_DIR)
    files = [f for f in ftp.nlst() if re.match(r"TabelaUnificada_\d{6}_v\d+\.zip$", f, re.I)]
    if competencia:
        files = [f for f in files if f"_{competencia}_" in f]
    if not files:
        raise SystemExit("Nenhum pacote encontrado no FTP.")
    # Ordena por competência e, dentro dela, pela versão (republicações).
    name = max(files, key=lambda f: tuple(map(int, re.findall(r"\d+", f)[:2])))
    log(f"Baixando {name} ...")
    buf = io.BytesIO()
    ftp.retrbinary(f"RETR {name}", buf.write)
    ftp.quit()
    return name, buf.getvalue()


def build_oficial(zip_name: str, zip_bytes: bytes):
    pkg = Package(zip_bytes)
    comp = re.search(r"_(\d{6})_", zip_name).group(1)
    log(f"Processando competência {label(comp)}")

    def kv(table, key, val):
        return {r[key]: r[val] for r in pkg.rows(table) if r.get(key)}

    base = {
        "grupos": kv("tb_grupo", "CO_GRUPO", "NO_GRUPO"),
        "subgrupos": {r["CO_GRUPO"] + r["CO_SUB_GRUPO"]: r["NO_SUB_GRUPO"] for r in pkg.rows("tb_sub_grupo")},
        "formas": {
            r["CO_GRUPO"] + r["CO_SUB_GRUPO"] + r["CO_FORMA_ORGANIZACAO"]: r["NO_FORMA_ORGANIZACAO"]
            for r in pkg.rows("tb_forma_organizacao")
        },
        "financiamentos": kv("tb_financiamento", "CO_FINANCIAMENTO", "NO_FINANCIAMENTO"),
        "rubricas": kv("tb_rubrica", "CO_RUBRICA", "NO_RUBRICA"),
        "modalidades": kv("tb_modalidade", "CO_MODALIDADE", "NO_MODALIDADE"),
        "registros": kv("tb_registro", "CO_REGISTRO", "NO_REGISTRO"),
        "servicos": kv("tb_servico", "CO_SERVICO", "NO_SERVICO"),
        "classificacoes": {
            f'{r["CO_SERVICO"]}-{r["CO_CLASSIFICACAO"]}': r["NO_CLASSIFICACAO"]
            for r in pkg.rows("tb_servico_classificacao")
        },
        "ocupacoes": kv("tb_ocupacao", "CO_OCUPACAO", "NO_OCUPACAO"),
        "habilitacoes": kv("tb_habilitacao", "CO_HABILITACAO", "NO_HABILITACAO"),
        "gruposHabilitacao": kv("tb_grupo_habilitacao", "NU_GRUPO_HABILITACAO", "NO_GRUPO_HABILITACAO"),
        "leitos": kv("tb_tipo_leito", "CO_TIPO_LEITO", "NO_TIPO_LEITO"),
        "renases": kv("tb_renases", "CO_RENASES", "NO_RENASES"),
        "tuss": kv("tb_tuss", "CO_TUSS", "NO_TUSS"),
        "redes": kv("tb_rede_atencao", "CO_REDE_ATENCAO", "NO_REDE_ATENCAO"),
        "componentesRede": kv("tb_componente_rede", "CO_COMPONENTE_REDE", "NO_COMPONENTE_REDE"),
        "siaSih": kv("tb_sia_sih", "CO_PROCEDIMENTO_SIA_SIH", "NO_PROCEDIMENTO_SIA_SIH"),
    }
    base["regras"] = {
        r["CO_REGRA_CONDICIONADA"]: [r.get("NO_REGRA_CONDICIONADA", ""), r.get("DS_REGRA_CONDICIONADA", "")]
        for r in pkg.rows("tb_regra_condicionada")
    }
    desc_det = kv("tb_descricao_detalhe", "CO_DETALHE", "DS_DETALHE")
    base["detalhes"] = {
        r["CO_DETALHE"]: [r.get("NO_DETALHE", ""), desc_det.get(r["CO_DETALHE"], "")]
        for r in pkg.rows("tb_detalhe")
    }

    # Relacionamentos agrupados por procedimento.
    rel = defaultdict(lambda: defaultdict(list))

    def add(table, key, field, fn):
        for r in pkg.rows(table):
            rel[r[key]][field].append(fn(r))

    add("rl_procedimento_cid", "CO_PROCEDIMENTO", "cid", lambda r: [r["CO_CID"], 1 if r.get("ST_PRINCIPAL") == "S" else 0])
    add("rl_procedimento_ocupacao", "CO_PROCEDIMENTO", "cbo", lambda r: r["CO_OCUPACAO"])
    add("rl_procedimento_habilitacao", "CO_PROCEDIMENTO", "hab", lambda r: [r["CO_HABILITACAO"], r.get("NU_GRUPO_HABILITACAO") or ""])
    add("rl_procedimento_leito", "CO_PROCEDIMENTO", "lei", lambda r: r["CO_TIPO_LEITO"])
    add("rl_procedimento_servico", "CO_PROCEDIMENTO", "srv", lambda r: f'{r["CO_SERVICO"]}-{r["CO_CLASSIFICACAO"]}')
    add("rl_procedimento_modalidade", "CO_PROCEDIMENTO", "mod", lambda r: r["CO_MODALIDADE"])
    add("rl_procedimento_registro", "CO_PROCEDIMENTO", "reg", lambda r: r["CO_REGISTRO"])
    add("rl_procedimento_detalhe", "CO_PROCEDIMENTO", "det", lambda r: r["CO_DETALHE"])
    add("rl_procedimento_regra_cond", "CO_PROCEDIMENTO", "rc", lambda r: r["CO_REGRA_CONDICIONADA"])
    add("rl_procedimento_renases", "CO_PROCEDIMENTO", "ren", lambda r: r["CO_RENASES"])
    add("rl_procedimento_tuss", "CO_PROCEDIMENTO", "tus", lambda r: r["CO_TUSS"])
    add("rl_procedimento_origem", "CO_PROCEDIMENTO", "ori", lambda r: r["CO_PROCEDIMENTO_ORIGEM"])
    add("rl_procedimento_sia_sih", "CO_PROCEDIMENTO", "sia", lambda r: [r["CO_PROCEDIMENTO_SIA_SIH"], r.get("TP_PROCEDIMENTO", "")])
    add("rl_procedimento_comp_rede", "CO_PROCEDIMENTO", "rede", lambda r: r["CO_COMPONENTE_REDE"])
    add(
        "rl_procedimento_incremento", "CO_PROCEDIMENTO", "inc",
        lambda r: [r["CO_HABILITACAO"]] + [(to_int(r.get(k)) or 0) / 100 for k in ("VL_PERCENTUAL_SH", "VL_PERCENTUAL_SA", "VL_PERCENTUAL_SP")],
    )
    add(
        "rl_procedimento_compativel", "CO_PROCEDIMENTO_PRINCIPAL", "cpt",
        lambda r: [r["CO_PROCEDIMENTO_COMPATIVEL"], r["CO_REGISTRO_PRINCIPAL"], r["CO_REGISTRO_COMPATIVEL"],
                   r.get("TP_COMPATIBILIDADE", ""), qty(r.get("QT_PERMITIDA"))],
    )
    add(
        "rl_excecao_compatibilidade", "CO_PROCEDIMENTO_PRINCIPAL", "exc",
        lambda r: [r["CO_PROCEDIMENTO_RESTRICAO"], r["CO_PROCEDIMENTO_COMPATIVEL"], r["CO_REGISTRO_PRINCIPAL"],
                   r["CO_REGISTRO_COMPATIVEL"], r.get("TP_COMPATIBILIDADE", "")],
    )
    for r in pkg.rows("tb_descricao"):
        rel[r["CO_PROCEDIMENTO"]]["d"] = r.get("DS_PROCEDIMENTO", "")

    procs = []
    for r in pkg.rows("tb_procedimento"):
        co = r["CO_PROCEDIMENTO"]
        procs.append([
            co, r["NO_PROCEDIMENTO"], r.get("TP_COMPLEXIDADE") or None, r.get("TP_SEXO") or None,
            qty(r.get("QT_MAXIMA_EXECUCAO")), qty(r.get("QT_DIAS_PERMANENCIA")), to_int(r.get("QT_PONTOS")),
            qty(r.get("VL_IDADE_MINIMA")), qty(r.get("VL_IDADE_MAXIMA")),
            to_int(r.get("VL_SH")) or 0, to_int(r.get("VL_SA")) or 0, to_int(r.get("VL_SP")) or 0,
            r.get("CO_FINANCIAMENTO") or None, r.get("CO_RUBRICA") or None, qty(r.get("QT_TEMPO_PERMANENCIA")),
            sorted(set(rel[co].get("mod", []))), sorted(set(rel[co].get("reg", []))),
        ])
    procs.sort(key=lambda p: p[0])

    cids = {r["CO_CID"]: [r["NO_CID"], r.get("TP_SEXO") or "", r.get("TP_AGRAVO") or ""] for r in pkg.rows("tb_cid")}

    meta = {
        "competencia": comp,
        "rotulo": label(comp),
        "fonte": "Ministério da Saúde / DATASUS — SIGTAP (Tabela Unificada)",
        "arquivo": zip_name,
        "url": f"ftp://{FTP_HOST}{FTP_DIR}/{zip_name}",
        "geradoEm": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "completo": True,
        "avisos": [],
    }
    shards = defaultdict(dict)
    for co, data in rel.items():
        entry = {k: v for k, v in data.items() if k not in ("mod", "reg")}
        if entry:
            shards[co[:2]][co] = entry
    write_output(comp, meta, base, procs, cids, shards)


# --------------------------------------------------------------------------
# Seed a partir dos pacotes npm @br-health-kit/*


def build_seed(sigtap_dir: Path, cid_dir: Path | None):
    versions = sorted(p for p in (sigtap_dir / "data").iterdir() if p.is_dir())
    vdir = versions[-1]
    src_meta = json.loads((vdir / "metadata.json").read_text("utf-8"))
    comp = vdir.name.replace(".", "")
    log(f"Seed da competência {label(comp)} a partir de {vdir}")

    def table(name):
        return json.loads((vdir / "tables" / f"{name}.json").read_text("utf-8"))

    def kv(name):
        return {r["code"]: r["name"] for r in table(name)}

    base = {
        "grupos": kv("groups"),
        "subgrupos": kv("subGroups"),
        "formas": kv("organizationForms"),
        "financiamentos": kv("financings"),
        "rubricas": kv("rubrics"),
        "modalidades": kv("modalities"),
        "registros": kv("registries"),
        "servicos": kv("services"),
        "classificacoes": {f'{r["service"]}-{r["code"]}': r["name"] for r in table("serviceClassifications")},
        "ocupacoes": kv("occupations"),
    }
    cx = {"notApplicable": "0", "primaryCare": "1", "mediumComplexity": "2", "highComplexity": "3"}
    procs = []
    for p in table("procedures"):
        procs.append([
            p["code"], p["name"], cx.get(p["complexity"]),
            None,  # sexo: o campo do pacote npm não é confiável (ex.: cesariana como "ambos")
            p["maxExecutions"], p["stayDays"], p["points"], p["ageMinMonths"], p["ageMaxMonths"],
            p["hospitalValueCents"], p["ambulatoryValueCents"], p["professionalValueCents"],
            p["financingCode"], p["rubricCode"], None, [], [],
        ])
    procs.sort(key=lambda p: p[0])

    cids = {}
    if cid_dir:
        cv = sorted(p for p in (cid_dir / "data").iterdir() if p.is_dir())[-1]
        sexo = {"female": "F", "male": "M"}
        for name in ("categories", "subcategories"):
            for c in json.loads((cv / "tables" / f"{name}.json").read_text("utf-8")):
                if c.get("hasSubcategories"):
                    continue
                cids[c["code"].replace(".", "")] = [c["description"], sexo.get(c["sexRestriction"], ""), ""]
    meta = {
        "competencia": comp,
        "rotulo": label(comp),
        "fonte": src_meta.get("source", "DATASUS - SIGTAP"),
        "arquivo": Path(src_meta.get("sourceUrl", "")).name,
        "url": src_meta.get("sourceUrl", ""),
        "publicadoEm": src_meta.get("publishedAt"),
        "geradoEm": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "completo": False,
        "avisos": [
            "Esta competência foi gerada a partir das tabelas principais do pacote oficial. "
            "Relacionamentos (CID, CBO, habilitações, leitos, serviços, compatibilidades, "
            "descrições, regras condicionadas, RENASES, TUSS) e o sexo permitido não estão incluídos. "
            "Execute scripts/sigtap_build.py oficial (ou o workflow mensal) para a carga completa.",
        ],
    }
    write_output(comp, meta, base, procs, cids, {})


# --------------------------------------------------------------------------
# Saída


def write_output(comp, meta, base, procs, cids, shards):
    out = DATA / comp
    if out.exists():
        for f in sorted(out.rglob("*.json"), reverse=True):
            f.unlink()
    meta["totais"] = {
        "procedimentos": len(procs),
        "grupos": len(base.get("grupos", {})),
        "subgrupos": len(base.get("subgrupos", {})),
        "formas": len(base.get("formas", {})),
        "ocupacoes": len(base.get("ocupacoes", {})),
        "cids": len(cids),
        "relacionamentos": sum(len(s) for s in shards.values()),
    }
    meta["shards"] = sorted(shards)
    write_json(out / "base.json", {"meta": meta, "cols": PROC_COLS, **base, "procedimentos": procs})
    if cids:
        write_json(out / "cid.json", cids)
    for g, items in shards.items():
        write_json(out / "rel" / f"{g}.json", items)

    manifest_path = DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else {"competencias": []}
    items = [c for c in manifest["competencias"] if c["id"] != comp]
    items.append({
        "id": comp, "rotulo": meta["rotulo"], "completo": meta["completo"],
        "procedimentos": len(procs), "geradoEm": meta["geradoEm"], "arquivo": meta.get("arquivo", ""),
    })
    items.sort(key=lambda c: c["id"], reverse=True)
    keep = int(os.environ.get("SIGTAP_MANTER", "0") or 0)
    if keep > 0:
        for old in items[keep:]:
            for f in sorted((DATA / old["id"]).rglob("*"), reverse=True):
                f.unlink() if f.is_file() else f.rmdir()
            (DATA / old["id"]).rmdir()
            log(f"  removida competência antiga {old['id']}")
        items = items[:keep]
    manifest = {"atual": items[0]["id"], "competencias": items}
    write_json(manifest_path, manifest)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("oficial", help="pacote oficial do DATASUS (FTP ou arquivo local)")
    o.add_argument("--zip", type=Path, help="usa um TabelaUnificada_*.zip já baixado")
    o.add_argument("--competencia", help="AAAAMM; padrão: a mais recente no FTP")
    s = sub.add_parser("seed", help="tabelas dos pacotes npm @br-health-kit/sigtap e /cid10")
    s.add_argument("--sigtap", type=Path, required=True, help="diretório extraído de @br-health-kit/sigtap")
    s.add_argument("--cid", type=Path, help="diretório extraído de @br-health-kit/cid10")
    args = ap.parse_args()

    if args.cmd == "oficial":
        if args.zip:
            build_oficial(args.zip.name, args.zip.read_bytes())
        else:
            name, data = ftp_latest(args.competencia)
            build_oficial(name, data)
    else:
        build_seed(args.sigtap, args.cid)


if __name__ == "__main__":
    main()
