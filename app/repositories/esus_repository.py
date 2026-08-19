"""Consultas somente-leitura ao banco do e-SUS APS.

ATENÇÃO: as queries abaixo são PLACEHOLDERS baseados no modelo de dados
público do e-SUS APS (LEDI/DW — ver https://sisaps.saude.gov.br). Os nomes
reais de schema/tabelas/colunas variam por versão instalada. Assim que o
schema real for compartilhado, ajuste apenas as strings SQL abaixo — a
interface pública (`EsusRepository`) não deve mudar, pois é o que o resto do
serviço (Situação 1) consome.

Todas as queries devem:
  - Filtrar por identidade do paciente (CPF/CNS — ver `settings.patient_identity_key`).
  - Trazer o mínimo de colunas necessário (nunca `SELECT *`).
  - Ter LIMIT explícito para nunca puxar histórico ilimitado de um paciente.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class EsusAtendimento:
    data_atendimento: date
    tipo_atendimento: str | None
    cid10_ou_ciap2: str | None
    descricao_problema: str | None
    profissional: str | None
    unidade: str | None


@dataclass(frozen=True)
class EsusMedicacaoEmUso:
    nome_medicamento: str
    dose: str | None
    data_prescricao: date | None


class EsusRepository:
    """Camada de acesso somente-leitura ao e-SUS APS.

    Uso: `EsusRepository(session).historico_atendimentos(cpf, limit=100)`.
    """

    def __init__(self, session: Session):
        self._session = session

    def historico_atendimentos(self, identity_value: str, limit: int = 200) -> list[EsusAtendimento]:
        """TODO(schema real): ajustar nomes de tabela/coluna do e-SUS APS.

        Placeholder ilustrativo — assume tabelas típicas do modelo LEDI/DW
        (`tb_atendimento`, `tb_cidadao`, `tb_problema_condicao`). Substituir
        pelos nomes reais assim que o schema for compartilhado.
        """
        query = text(
            """
            SELECT
                a.dt_atendimento          AS data_atendimento,
                a.tp_atendimento          AS tipo_atendimento,
                p.co_cid10_ciap2          AS cid10_ou_ciap2,
                p.ds_problema             AS descricao_problema,
                prof.no_profissional      AS profissional,
                u.no_unidade_saude        AS unidade
            FROM tb_atendimento a
            JOIN tb_cidadao c            ON c.co_cidadao = a.co_cidadao
            LEFT JOIN tb_problema_condicao p ON p.co_atendimento = a.co_atendimento
            LEFT JOIN tb_profissional prof   ON prof.co_profissional = a.co_profissional
            LEFT JOIN tb_unidade_saude u      ON u.co_unidade_saude = a.co_unidade_saude
            WHERE c.nu_cpf = :identity_value
            ORDER BY a.dt_atendimento DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [EsusAtendimento(**row._mapping) for row in rows]

    def medicacoes_em_uso(self, identity_value: str, limit: int = 100) -> list[EsusMedicacaoEmUso]:
        """TODO(schema real): confirmar tabela de prescrições do e-SUS APS."""
        query = text(
            """
            SELECT
                m.no_medicamento   AS nome_medicamento,
                m.ds_dose          AS dose,
                m.dt_prescricao    AS data_prescricao
            FROM tb_prescricao_medicamento m
            JOIN tb_cidadao c ON c.co_cidadao = m.co_cidadao
            WHERE c.nu_cpf = :identity_value
              AND (m.dt_fim_uso IS NULL OR m.dt_fim_uso >= CURRENT_DATE)
            ORDER BY m.dt_prescricao DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [EsusMedicacaoEmUso(**row._mapping) for row in rows]
