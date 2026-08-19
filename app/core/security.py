"""Autenticação simples de serviço-a-serviço (Sistema IS -> este microserviço).

Espera o header `X-API-Key` com o valor configurado em `SERVICE_API_KEY`.
Suficiente para um microserviço interno atrás de rede privada/mTLS; se o
serviço passar a ser exposto publicamente, evoluir para OAuth2/JWT.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_api_key(x_api_key: str = Header(default="")) -> None:
    settings = get_settings()
    if not settings.service_api_key:
        # Ambiente de desenvolvimento sem chave configurada: não bloqueia,
        # mas isso nunca deve acontecer em produção (validar no deploy).
        return
    if not secrets.compare_digest(x_api_key, settings.service_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key inválida")
