#!/usr/bin/env python
"""Testa a conectividade somente-leitura com as duas bases clínicas + app db.

Uso: `python scripts/test_db_connections.py`

Útil para validar as credenciais do `.env` assim que forem preenchidas,
antes de conectar qualquer parte do serviço a elas.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.db.base import get_app_engine  # noqa: E402
from app.db.esus import get_esus_engine  # noqa: E402
from app.db.readonly import check_connection  # noqa: E402
from app.db.sistema_is import get_sistema_is_engine  # noqa: E402


def main() -> None:
    settings = get_settings()
    results: dict[str, str] = {}

    try:
        check_connection(get_app_engine())
        results["app_db"] = "OK"
    except Exception as exc:  # noqa: BLE001
        results["app_db"] = f"FALHOU: {exc}"

    if settings.esus.is_configured:
        try:
            check_connection(get_esus_engine())
            results["esus_db"] = "OK"
        except Exception as exc:  # noqa: BLE001
            results["esus_db"] = f"FALHOU: {exc}"
    else:
        results["esus_db"] = "não configurado no .env"

    if settings.sistema_is.is_configured:
        try:
            check_connection(get_sistema_is_engine())
            results["sistema_is_db"] = "OK"
        except Exception as exc:  # noqa: BLE001
            results["sistema_is_db"] = f"FALHOU: {exc}"
    else:
        results["sistema_is_db"] = "não configurado no .env"

    print("Resultado dos testes de conexão:")
    for name, status in results.items():
        print(f"  - {name}: {status}")


if __name__ == "__main__":
    main()
