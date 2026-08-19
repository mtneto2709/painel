"""Job de pré-geração em lote dos perfis da Situação 1.

Pensado para rodar via cron (ex.: toda madrugada) sobre a lista de pacientes
com atendimento agendado para o dia seguinte — assim o relatório já está no
cache quando o profissional abrir o prontuário, e o custo de LLM acontece
fora do horário de pico, de forma previsível e orçada.

TODO(schema real): `listar_pacientes_com_agenda_amanha` depende da tabela de
agendamento do Sistema IS/e-SUS, ainda não mapeada — placeholder abaixo.

Uso: `python -m app.workers.profile_precompute`
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.db.base import get_app_sessionmaker
from app.db.esus import esus_session
from app.db.sistema_is import sistema_is_session
from app.services.situacao1_profile import get_or_generate_profile

logger = logging.getLogger(__name__)


def listar_pacientes_com_agenda_amanha(sistema_is_session_obj) -> list[str]:
    """TODO(schema real): consultar a tabela de agendamento real.

    Por ora, retorna lista vazia — implementar assim que o schema de
    agendamento (e-SUS e/ou Sistema IS) for compartilhado.
    """
    return []


def run() -> None:
    settings = get_settings()
    app_sessionmaker = get_app_sessionmaker()

    with sistema_is_session() as sis_session_for_listing:
        pacientes = listar_pacientes_com_agenda_amanha(sis_session_for_listing)

    logger.info("Pré-geração de perfis: %d pacientes na agenda de amanhã", len(pacientes))

    for identity_value in pacientes:
        app_session = app_sessionmaker()
        try:
            with esus_session() as esus_db, sistema_is_session() as sistema_is_db:
                get_or_generate_profile(
                    app_session,
                    esus_db,
                    sistema_is_db,
                    identity_key=settings.patient_identity_key,
                    identity_value=identity_value,
                )
            app_session.commit()
        except Exception:  # noqa: BLE001
            logger.exception("Falha ao pré-gerar perfil para %s", identity_value)
            app_session.rollback()
        finally:
            app_session.close()


if __name__ == "__main__":
    logging.basicConfig(level="INFO")
    run()
