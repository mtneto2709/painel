"""Consultas somente-leitura ao banco do Sistema IS (aplicação principal).

STATUS DO SCHEMA:
  - O worker irmão (app independente, branch `claude/esus-is-sync-app-39lftg`)
    confirma que o Sistema IS usa os schemas `sotech` e `ish` (não `public`),
    com convenção de prefixos `cdg_` (cadastro), `ate_` (atendimento) e
    `tbn_`/`tbl_` (tabelas de domínio). Tabelas confirmadas por esse worker:
    `sotech.cdg_paciente`, `sotech.ate_atendimento`, `sotech.ate_chamada`,
    `sotech.cdg_unidadesaude`, `sotech.cdg_setor`, `sotech.cdg_interveniente`
    (profissionais/intervenientes), `sotech.tbn_especialidade`,
    `ish.sys_usuario`.
  - PORÉM esse worker só *chama uma função* (`sotech.esus_criar_chamada`) —
    não faz SELECT nessas tabelas — então não temos confirmação dos NOMES
    DE COLUNA. As queries abaixo já usam os nomes de tabela/schema corretos,
    mas as colunas ainda são placeholders (convenção comum, não confirmada)
    e precisam ser validadas contra o banco real antes de uso em produção.
  - Não há, até o momento, nenhuma tabela confirmada de exames/alergias no
    Sistema IS — `exames()` e `alergias()` seguem 100% placeholder.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class SistemaISAtendimento:
    data_atendimento: date
    especialidade: str | None
    diagnostico: str | None
    conduta: str | None
    profissional: str | None


@dataclass(frozen=True)
class SistemaISExame:
    nome_exame: str
    data_exame: date
    resultado_resumo: str | None


@dataclass(frozen=True)
class SistemaISAlergia:
    substancia: str
    reacao: str | None
    gravidade: str | None


class SistemaISRepository:
    """Camada de acesso somente-leitura ao banco do Sistema IS."""

    def __init__(self, session: Session):
        self._session = session

    def historico_atendimentos(self, identity_value: str, limit: int = 200) -> list[SistemaISAtendimento]:
        """Tabelas/schema confirmados (`sotech.ate_atendimento`,
        `sotech.cdg_paciente`, `sotech.tbn_especialidade`,
        `sotech.cdg_interveniente`); colunas ainda placeholder — ver
        cabeçalho do módulo.
        """
        query = text(
            """
            SELECT
                a.data_atendimento,
                esp.nome_especialidade AS especialidade,
                a.diagnostico,
                a.conduta,
                prof.nome AS profissional
            FROM sotech.ate_atendimento a
            JOIN sotech.cdg_paciente pac ON pac.id = a.paciente_id
            LEFT JOIN sotech.tbn_especialidade esp ON esp.id = a.especialidade_id
            LEFT JOIN sotech.cdg_interveniente prof ON prof.id = a.profissional_id
            WHERE pac.cpf = :identity_value
            ORDER BY a.data_atendimento DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [SistemaISAtendimento(**row._mapping) for row in rows]

    def exames(self, identity_value: str, limit: int = 100) -> list[SistemaISExame]:
        """TODO(schema real): nenhuma tabela de exames foi confirmada até
        agora — nem pelo schema `sotech`/`ish`, nem por outra fonte. Nomes
        abaixo são placeholder completo.
        """
        query = text(
            """
            SELECT
                e.nome_exame,
                e.data_exame,
                e.resultado_resumo
            FROM sotech.ate_exame e
            JOIN sotech.cdg_paciente pac ON pac.id = e.paciente_id
            WHERE pac.cpf = :identity_value
            ORDER BY e.data_exame DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [SistemaISExame(**row._mapping) for row in rows]

    def alergias(self, identity_value: str) -> list[SistemaISAlergia]:
        """TODO(schema real): nenhuma tabela de alergias foi confirmada até
        agora. Nomes abaixo são placeholder completo.
        """
        query = text(
            """
            SELECT al.substancia, al.reacao, al.gravidade
            FROM sotech.cdg_alergia al
            JOIN sotech.cdg_paciente pac ON pac.id = al.paciente_id
            WHERE pac.cpf = :identity_value
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value})
        return [SistemaISAlergia(**row._mapping) for row in rows]
