"""Banco próprio do microserviço (leitura/escrita).

Guarda apenas o que é do próprio serviço: cache de relatórios gerados,
estado de sessões de consulta em andamento, memória vetorial da literatura
médica e auditoria de uso/custo de LLM. Nunca replica dado clínico bruto do
e-SUS ou do Sistema IS além do estritamente necessário para cache (com TTL).
"""

from __future__ import annotations

from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_app_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        settings.app_db_url,
        pool_size=settings.app_db_pool_size,
        pool_pre_ping=True,
    )


@lru_cache
def get_app_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_app_engine(), autoflush=False, expire_on_commit=False)


def get_app_session() -> Session:
    """Dependency do FastAPI — uma sessão por request, com commit/rollback."""
    session = get_app_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
