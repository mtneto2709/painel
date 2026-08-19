"""Consultas somente-leitura ao banco do e-SUS APS.

STATUS DO SCHEMA:
  - `historico_atendimentos` usa tabelas e colunas CONFIRMADAS: a instalação
    real do e-SUS deste projeto foi inspecionada por um worker irmão (app
    independente, branch `claude/esus-is-sync-app-39lftg`, arquivo
    `src/esusQueries.ts`) que já consulta esse mesmo banco em produção para
    outro propósito (acionar o painel de chamada). Reaproveitamos aqui só o
    CONHECIMENTO do schema (nomes de tabela/coluna) — nenhum código é
    compartilhado entre as duas aplicações, que continuam independentes.
  - `medicacoes_em_uso` segue como PLACEHOLDER — o worker irmão não toca em
    medicação/prescrição, então essa tabela ainda não foi confirmada.
    Mantive a convenção de nomenclatura observada no restante do schema
    (prefixo `tb_`, PK `co_seq_*`, colunas `no_/nu_/dt_/st_/tp_`), mas os
    nomes exatos precisam ser validados contra o banco real.

Todas as queries devem:
  - Filtrar por identidade do paciente (CPF — `tb_cidadao.nu_cpf`, confirmado).
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
    status_atendimento: str | None
    tipo_atendimento: str | None
    profissional: str | None
    cbo: str | None
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
        """Schema confirmado (ver cabeçalho do módulo).

        Equivalente, para fins de histórico, à consulta que
        `public.tb_atend_chamar` faz no e-SUS original — aqui trazemos só os
        campos relevantes para o perfil clínico (não o payload completo de
        chamada de paciente, que é responsabilidade do worker irmão).
        """
        query = text(
            """
            WITH atendimento_profissional AS (
                SELECT
                    ap.co_atend AS cod_atendimento,
                    MAX(ap.co_seq_atend_prof) AS cod_atendimento_prof
                FROM public.tb_atend_prof ap
                INNER JOIN public.tb_atend a2 ON a2.co_seq_atend = ap.co_atend
                INNER JOIN public.tb_prontuario pr2 ON pr2.co_seq_prontuario = a2.co_prontuario
                INNER JOIN public.tb_cidadao c2 ON c2.co_seq_cidadao = pr2.co_cidadao
                WHERE c2.nu_cpf = :identity_value
                GROUP BY 1
            )
            SELECT
                a.dt_ultima_alteracao_status                       AS data_atendimento,
                upper(trim(status_atendimento.no_identificador))   AS status_atendimento,
                tipo_atendimento_prof.no_tipo_atend_prof            AS tipo_atendimento,
                upper(trim(profissional.no_profissional_filtro))   AS profissional,
                cbo.no_cbo                                          AS cbo,
                upper(trim(unidadesaude.no_unidade_saude))          AS unidade
            FROM public.tb_atend a
            INNER JOIN public.tb_prontuario prontuario         ON prontuario.co_seq_prontuario = a.co_prontuario
            INNER JOIN public.tb_cidadao cidadao                ON cidadao.co_seq_cidadao = prontuario.co_cidadao
            INNER JOIN public.tb_status_atend status_atendimento ON status_atendimento.co_status_atend = a.st_atend
            LEFT JOIN public.tb_unidade_saude unidadesaude      ON unidadesaude.co_seq_unidade_saude = a.co_unidade_saude
            LEFT JOIN atendimento_profissional ap_map           ON ap_map.cod_atendimento = a.co_seq_atend
            LEFT JOIN public.tb_atend_prof atendimento_prof     ON atendimento_prof.co_seq_atend_prof = ap_map.cod_atendimento_prof
            LEFT JOIN public.tb_lotacao lotacao                 ON lotacao.co_ator_papel = atendimento_prof.co_lotacao
            LEFT JOIN public.tb_prof profissional                ON profissional.co_seq_prof = lotacao.co_prof
            LEFT JOIN public.tb_cbo cbo                          ON cbo.co_cbo = lotacao.co_cbo
            LEFT JOIN public.tb_tipo_atend_prof tipo_atendimento_prof
                   ON tipo_atendimento_prof.co_tipo_atend_prof = atendimento_prof.tp_atend_prof
            WHERE cidadao.nu_cpf = :identity_value
            ORDER BY a.dt_ultima_alteracao_status DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [EsusAtendimento(**row._mapping) for row in rows]

    def medicacoes_em_uso(self, identity_value: str, limit: int = 100) -> list[EsusMedicacaoEmUso]:
        """TODO(schema real): tabela de prescrições ainda NÃO confirmada.

        O worker irmão (branch `claude/esus-is-sync-app-39lftg`) não consulta
        medicação, então esta query segue como placeholder — a convenção de
        nomenclatura já é a real (`tb_`, `co_seq_*`, `nu_cpf`), mas o nome da
        tabela/colunas de prescrição precisa ser validado contra o banco.
        """
        query = text(
            """
            SELECT
                m.no_medicamento   AS nome_medicamento,
                m.ds_dose          AS dose,
                m.dt_prescricao    AS data_prescricao
            FROM public.tb_prescricao_medicamento m
            JOIN public.tb_cidadao c ON c.co_seq_cidadao = m.co_cidadao
            WHERE c.nu_cpf = :identity_value
              AND (m.dt_fim_uso IS NULL OR m.dt_fim_uso >= CURRENT_DATE)
            ORDER BY m.dt_prescricao DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [EsusMedicacaoEmUso(**row._mapping) for row in rows]
