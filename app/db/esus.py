"""Conexão somente-leitura à base do e-SUS APS (Prontuário Eletrônico do
Cidadão da Atenção Primária).

O schema real depende da versão instalada do e-SUS APS (LEDI). Este módulo
só monta a engine; as queries específicas ficam em
`app/repositories/esus_repository.py`, que hoje contém exemplos/placeholders
documentados até recebermos o schema real.
"""

from __future__ import annotations

from functools import lru_cache

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.readonly import build_readonly_engine, build_sessionmaker, readonly_session


@lru_cache
def get_esus_engine() -> Engine:
    return build_readonly_engine(get_settings().esus)


@lru_cache
def get_esus_sessionmaker() -> sessionmaker[Session]:
    return build_sessionmaker(get_esus_engine())


def esus_session():
    return readonly_session(get_esus_sessionmaker())
