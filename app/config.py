"""Configuração central do serviço, carregada do ambiente/.env.

Todas as credenciais de banco chegam aqui via variáveis de ambiente — nunca
hardcoded. As duas fontes clínicas (e-SUS e Sistema IS) são configuradas de
forma simétrica e isolada uma da outra, cada uma com seu próprio pool e
timeout, para que uma lentidão em uma fonte nunca trave a outra.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ReadOnlyDatabaseSettings(BaseSettings):
    """Configuração de uma conexão somente-leitura a um Postgres externo."""

    host: str = ""
    port: int = 5432
    name: str = ""
    user: str = ""
    password: str = ""
    schema_: str = Field(default="public", alias="schema")
    pool_size: int = 3
    statement_timeout_ms: int = 15000
    sslmode: str = "prefer"

    def sqlalchemy_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/{self.name}"
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.host and self.name and self.user)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_env: Literal["development", "staging", "production"] = "development"
    app_name: str = "clinical-rag-agent"
    log_level: str = "INFO"
    service_api_key: str = ""

    # Fonte 1a — e-SUS APS
    esus_db_host: str = ""
    esus_db_port: int = 5432
    esus_db_name: str = ""
    esus_db_user: str = ""
    esus_db_password: str = ""
    esus_db_schema: str = "public"
    esus_db_pool_size: int = 3
    esus_db_statement_timeout_ms: int = 15000
    esus_db_sslmode: str = "prefer"

    # Fonte 1b — Sistema IS
    sistema_is_db_host: str = ""
    sistema_is_db_port: int = 5432
    sistema_is_db_name: str = ""
    sistema_is_db_user: str = ""
    sistema_is_db_password: str = ""
    sistema_is_db_schema: str = "public"
    sistema_is_db_pool_size: int = 3
    sistema_is_db_statement_timeout_ms: int = 15000
    sistema_is_db_sslmode: str = "prefer"

    # Banco próprio (app db)
    app_db_host: str = "localhost"
    app_db_port: int = 5433
    app_db_name: str = "clinical_rag_agent"
    app_db_user: str = "clinical_rag_agent"
    app_db_password: str = ""
    app_db_pool_size: int = 10

    redis_url: str = ""

    # LLM
    anthropic_api_key: str = ""
    llm_model_primary: str = "claude-sonnet-5"
    llm_model_fast: str = "claude-haiku-4-5-20251001"
    llm_daily_budget_usd: float = 200.0
    llm_use_batch_api: bool = True

    # Embeddings
    embeddings_provider: Literal["local", "voyage"] = "local"
    embeddings_local_model: str = (
        "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    )
    embeddings_dim: int = 768
    voyage_api_key: str = ""

    # Ingestão de fontes médicas
    ncbi_eutils_email: str = ""
    ncbi_eutils_api_key: str = ""
    dadosabertos_saude_base_url: str = "https://dadosabertos.saude.gov.br"

    # Identidade do paciente entre as duas bases
    patient_identity_key: Literal["cpf", "cns", "external_id_map"] = "cpf"

    @property
    def esus(self) -> ReadOnlyDatabaseSettings:
        return ReadOnlyDatabaseSettings(
            host=self.esus_db_host,
            port=self.esus_db_port,
            name=self.esus_db_name,
            user=self.esus_db_user,
            password=self.esus_db_password,
            schema=self.esus_db_schema,
            pool_size=self.esus_db_pool_size,
            statement_timeout_ms=self.esus_db_statement_timeout_ms,
            sslmode=self.esus_db_sslmode,
        )

    @property
    def sistema_is(self) -> ReadOnlyDatabaseSettings:
        return ReadOnlyDatabaseSettings(
            host=self.sistema_is_db_host,
            port=self.sistema_is_db_port,
            name=self.sistema_is_db_name,
            user=self.sistema_is_db_user,
            password=self.sistema_is_db_password,
            schema=self.sistema_is_db_schema,
            pool_size=self.sistema_is_db_pool_size,
            statement_timeout_ms=self.sistema_is_db_statement_timeout_ms,
            sslmode=self.sistema_is_db_sslmode,
        )

    @property
    def app_db_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.app_db_user}:{self.app_db_password}"
            f"@{self.app_db_host}:{self.app_db_port}/{self.app_db_name}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
