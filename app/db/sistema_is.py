"""Conexão somente-leitura à base do Sistema IS (aplicação principal do
painel).

Assim como em `app/db/esus.py`, este módulo apenas monta a engine; as
queries específicas ficam em `app/repositories/sistema_is_repository.py`.
"""

from __future__ import annotations

from functools import lru_cache

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.readonly import build_readonly_engine, build_sessionmaker, readonly_session


@lru_cache
def get_sistema_is_engine() -> Engine:
    return build_readonly_engine(get_settings().sistema_is)


@lru_cache
def get_sistema_is_sessionmaker() -> sessionmaker[Session]:
    return build_sessionmaker(get_sistema_is_engine())


def sistema_is_session():
    return readonly_session(get_sistema_is_sessionmaker())
