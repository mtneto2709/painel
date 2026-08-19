"""Fábrica genérica de engines SOMENTE LEITURA para as bases clínicas externas.

Duas camadas de proteção contra escrita acidental:
  1. Operacional: o usuário de banco configurado no `.env` deve ter apenas
     `GRANT SELECT` (responsabilidade de quem provisiona o banco).
  2. Técnica: a cada conexão nova deste pool, forçamos
     `SET default_transaction_read_only = on`, o que faz o Postgres rejeitar
     qualquer INSERT/UPDATE/DELETE/DDL nessa sessão, mesmo que o usuário
     tivesse permissão de escrita por engano.

Usado por `app/db/esus.py` e `app/db/sistema_is.py`, que apenas fixam qual
`ReadOnlyDatabaseSettings` alimenta a engine.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import ReadOnlyDatabaseSettings


def build_readonly_engine(settings: ReadOnlyDatabaseSettings) -> Engine:
    if not settings.is_configured:
        raise RuntimeError(
            "Conexão não configurada: preencha host/nome/usuário no .env "
            "antes de usar esta fonte de dados."
        )

    engine = create_engine(
        settings.sqlalchemy_url(),
        pool_size=settings.pool_size,
        pool_pre_ping=True,
        connect_args={
            "options": (
                f"-c statement_timeout={settings.statement_timeout_ms} "
                f"-c search_path={settings.schema_}"
            ),
            "sslmode": settings.sslmode,
        },
    )

    @event.listens_for(engine, "connect")
    def _enforce_read_only(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("SET default_transaction_read_only = on")
        cursor.close()

    return engine


def build_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


@contextmanager
def readonly_session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    """Sessão que garante rollback sempre — nunca há commit em bases externas."""
    session = session_factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def check_connection(engine: Engine) -> bool:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return True
