"""Contrato de saída da Situação 1 — perfil clínico estruturado do paciente."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ProblemaClinico(BaseModel):
    descricao: str
    codigo: str | None = None  # CID-10 ou CIAP2
    status: str  # ativo|resolvido
    desde: str | None = None
    fonte: str  # esus|sistema_is


class MedicacaoEmUso(BaseModel):
    nome: str
    dose: str | None = None
    desde: str | None = None
    alerta_interacao: str | None = None


class Alergia(BaseModel):
    substancia: str
    reacao: str | None = None
    gravidade: str | None = None


class AlertaClinico(BaseModel):
    tipo: str  # exame_vencido|conduta_pendente|interacao_medicamentosa|outro
    descricao: str
    prioridade: str  # alta|media|baixa


class FonteCitada(BaseModel):
    fonte: str
    titulo: str
    url: str


class PatientClinicalProfile(BaseModel):
    resumo_clinico: str
    problemas: list[ProblemaClinico] = []
    medicacoes_em_uso: list[MedicacaoEmUso] = []
    alergias: list[Alergia] = []
    alertas: list[AlertaClinico] = []
    pontos_atencao_proxima_consulta: list[str] = []
    fontes_citadas: list[FonteCitada] = []


class PatientProfileResponse(BaseModel):
    patient_identity_value: str
    profile: PatientClinicalProfile
    generated_at: datetime
    from_cache: bool
    history_hash: str
