"""Testa a leitura do pacote oficial com um zip sintético no formato do DATASUS.

Execute com:  python3 -m unittest discover -s tests
"""

import importlib.util
import io
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Tabelas mínimas: (nome, [(coluna, tamanho)], linhas)
TABLES = {
    "tb_grupo": ([("CO_GRUPO", 2), ("NO_GRUPO", 100), ("DT_COMPETENCIA", 6)], [["03", "Procedimentos clínicos", "202610"]]),
    "tb_sub_grupo": ([("CO_GRUPO", 2), ("CO_SUB_GRUPO", 2), ("NO_SUB_GRUPO", 100), ("DT_COMPETENCIA", 6)], [["03", "01", "Consultas / Atendimentos / Acompanhamentos", "202610"]]),
    "tb_forma_organizacao": (
        [("CO_GRUPO", 2), ("CO_SUB_GRUPO", 2), ("CO_FORMA_ORGANIZACAO", 2), ("NO_FORMA_ORGANIZACAO", 100), ("DT_COMPETENCIA", 6)],
        [["03", "01", "01", "Consultas médicas/outros profissionais de nível superior", "202610"]],
    ),
    "tb_financiamento": ([("CO_FINANCIAMENTO", 2), ("NO_FINANCIAMENTO", 100), ("DT_COMPETENCIA", 6)], [["06", "Média e Alta Complexidade (MAC)", "202610"]]),
    "tb_modalidade": ([("CO_MODALIDADE", 2), ("NO_MODALIDADE", 100), ("DT_COMPETENCIA", 6)], [["01", "Ambulatorial", "202610"]]),
    "tb_registro": ([("CO_REGISTRO", 2), ("NO_REGISTRO", 50), ("DT_COMPETENCIA", 6)], [["02", "BPA (Individualizado)", "202610"]]),
    "tb_ocupacao": ([("CO_OCUPACAO", 6), ("NO_OCUPACAO", 150)], [["225125", "Médico clínico"]]),
    "tb_cid": (
        [("CO_CID", 4), ("NO_CID", 100), ("TP_AGRAVO", 1), ("TP_SEXO", 1), ("TP_ESTADIO", 1), ("VL_CAMPOS_IRRADIADOS", 4)],
        [["I10 ", "Hipertensão essencial (primária)", "0", "I", "N", "0"]],
    ),
    "tb_procedimento": (
        [("CO_PROCEDIMENTO", 10), ("NO_PROCEDIMENTO", 250), ("TP_COMPLEXIDADE", 1), ("TP_SEXO", 1), ("QT_MAXIMA_EXECUCAO", 4),
         ("QT_DIAS_PERMANENCIA", 4), ("QT_PONTOS", 4), ("VL_IDADE_MINIMA", 4), ("VL_IDADE_MAXIMA", 4), ("VL_SH", 12),
         ("VL_SA", 12), ("VL_SP", 12), ("CO_FINANCIAMENTO", 2), ("CO_RUBRICA", 6), ("QT_TEMPO_PERMANENCIA", 4), ("DT_COMPETENCIA", 6)],
        [["0301010072", "CONSULTA MÉDICA EM ATENÇÃO ESPECIALIZADA", "2", "I", "0001", "9999", "0000", "0000", "9999",
          "000000000000", "000000001000", "000000000000", "06", "", "9999", "202610"]],
    ),
    "tb_descricao": ([("CO_PROCEDIMENTO", 10), ("DS_PROCEDIMENTO", 400), ("DT_COMPETENCIA", 6)], [["0301010072", "Consulta clínica realizada por médico.", "202610"]]),
    "rl_procedimento_cid": ([("CO_PROCEDIMENTO", 10), ("CO_CID", 4), ("ST_PRINCIPAL", 1), ("DT_COMPETENCIA", 6)], [["0301010072", "I10 ", "S", "202610"]]),
    "rl_procedimento_ocupacao": ([("CO_PROCEDIMENTO", 10), ("CO_OCUPACAO", 6), ("DT_COMPETENCIA", 6)], [["0301010072", "225125", "202610"]]),
    "rl_procedimento_modalidade": ([("CO_PROCEDIMENTO", 10), ("CO_MODALIDADE", 2), ("DT_COMPETENCIA", 6)], [["0301010072", "01", "202610"]]),
    "rl_procedimento_registro": ([("CO_PROCEDIMENTO", 10), ("CO_REGISTRO", 2), ("DT_COMPETENCIA", 6)], [["0301010072", "02", "202610"]]),
    "rl_procedimento_compativel": (
        [("CO_PROCEDIMENTO_PRINCIPAL", 10), ("CO_REGISTRO_PRINCIPAL", 2), ("CO_PROCEDIMENTO_COMPATIVEL", 10), ("CO_REGISTRO_COMPATIVEL", 2),
         ("TP_COMPATIBILIDADE", 1), ("QT_PERMITIDA", 4), ("DT_COMPETENCIA", 6)],
        [["0301010072", "02", "0202010473", "02", "1", "0002", "202610"]],
    ),
}


def make_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, (cols, rows) in TABLES.items():
            layout = ["Coluna,Tamanho,Inicio,Fim,Tipo"]
            pos = 1
            for col, size in cols:
                layout.append(f"{col},{size},{pos},{pos + size - 1},VARCHAR2")
                pos += size
            body = "\r\n".join("".join(v.ljust(s)[:s] for v, (_, s) in zip(row, cols)) for row in rows)
            z.writestr(f"{name}_layout.txt", "\r\n".join(layout).encode("latin-1"))
            z.writestr(f"{name}.txt", body.encode("latin-1"))
    return buf.getvalue()


class OficialTest(unittest.TestCase):
    def test_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["SIGTAP_DATA_DIR"] = tmp
            spec = importlib.util.spec_from_file_location("sigtap_build", ROOT / "scripts" / "sigtap_build.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            mod.build_oficial("TabelaUnificada_202610_v2610101010.zip", make_zip())

            base = json.loads((Path(tmp) / "202610" / "base.json").read_text("utf-8"))
            self.assertTrue(base["meta"]["completo"])
            self.assertEqual(base["grupos"], {"03": "Procedimentos clínicos"})
            self.assertIn("030101", base["formas"])
            proc = dict(zip(base["cols"], base["procedimentos"][0]))
            self.assertEqual(proc["co"], "0301010072")
            self.assertEqual(proc["no"], "CONSULTA MÉDICA EM ATENÇÃO ESPECIALIZADA")
            self.assertEqual(proc["sa"], 1000)
            self.assertEqual(proc["sx"], "I")
            self.assertIsNone(proc["idMax"])  # sentinela 9999
            self.assertEqual(proc["idMin"], 0)
            self.assertEqual(proc["mod"], ["01"])
            self.assertEqual(proc["reg"], ["02"])

            rel = json.loads((Path(tmp) / "202610" / "rel" / "03.json").read_text("utf-8"))["0301010072"]
            self.assertEqual(rel["cid"], [["I10", 1]])
            self.assertEqual(rel["cbo"], ["225125"])
            self.assertEqual(rel["cpt"], [["0202010473", "02", "02", "1", 2]])
            self.assertEqual(rel["d"], "Consulta clínica realizada por médico.")

            cid = json.loads((Path(tmp) / "202610" / "cid.json").read_text("utf-8"))
            self.assertEqual(cid["I10"][0], "Hipertensão essencial (primária)")

            manifest = json.loads((Path(tmp) / "manifest.json").read_text("utf-8"))
            self.assertEqual(manifest["atual"], "202610")


if __name__ == "__main__":
    unittest.main()
