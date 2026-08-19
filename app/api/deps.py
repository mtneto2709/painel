"""Dependências compartilhadas das rotas FastAPI."""

from __future__ import annotations

from typing import Iterator

from sqlalchemy.orm import Session

from app.db.base import get_app_session
from app.db.esus import esus_session
from app.db.sistema_is import sistema_is_session


def get_app_db() -> Iterator[Session]:
    yield from get_app_session()


def get_esus_db() -> Iterator[Session]:
    with esus_session() as session:
        yield session


def get_sistema_is_db() -> Iterator[Session]:
    with sistema_is_session() as session:
        yield session
