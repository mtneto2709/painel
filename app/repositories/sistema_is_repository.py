"""Consultas somente-leitura ao banco do Sistema IS (aplicação principal).

ATENÇÃO: PLACEHOLDER — nomes de tabela/coluna a confirmar com o schema real
do Sistema IS. A interface pública (`SistemaISRepository`) é o contrato que
o resto do serviço consome; apenas o SQL interno deve mudar quando o schema
for compartilhado.
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
        """TODO(schema real): ajustar nomes de tabela/coluna do Sistema IS."""
        query = text(
            """
            SELECT
                a.data_atendimento,
                a.especialidade,
                a.diagnostico,
                a.conduta,
                prof.nome AS profissional
            FROM atendimentos a
            JOIN pacientes pac ON pac.id = a.paciente_id
            LEFT JOIN profissionais prof ON prof.id = a.profissional_id
            WHERE pac.cpf = :identity_value
            ORDER BY a.data_atendimento DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [SistemaISAtendimento(**row._mapping) for row in rows]

    def exames(self, identity_value: str, limit: int = 100) -> list[SistemaISExame]:
        """TODO(schema real): confirmar tabela de resultados de exames."""
        query = text(
            """
            SELECT
                e.nome_exame,
                e.data_exame,
                e.resultado_resumo
            FROM exames e
            JOIN pacientes pac ON pac.id = e.paciente_id
            WHERE pac.cpf = :identity_value
            ORDER BY e.data_exame DESC
            LIMIT :limit
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value, "limit": limit})
        return [SistemaISExame(**row._mapping) for row in rows]

    def alergias(self, identity_value: str) -> list[SistemaISAlergia]:
        """TODO(schema real): confirmar tabela de alergias/reações adversas."""
        query = text(
            """
            SELECT al.substancia, al.reacao, al.gravidade
            FROM alergias al
            JOIN pacientes pac ON pac.id = al.paciente_id
            WHERE pac.cpf = :identity_value
            """
        )
        rows = self._session.execute(query, {"identity_value": identity_value})
        return [SistemaISAlergia(**row._mapping) for row in rows]
