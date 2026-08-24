import type { Pool } from "pg";

/**
 * Agendamento futuro do e-SUS, com os mesmos dados de identificacao de
 * paciente/profissional/unidade usados pelo find-or-create de
 * sotech.esus_criar_chamada. Extraido a partir da consulta validada pelo
 * usuario (tb_agendado + tb_prontuario/tb_cidadao + tb_lotacao/tb_prof/tb_cbo
 * + tb_unidade_saude), somente leitura.
 *
 * O lado IS (onde/como gravar isso) ainda esta pendente de mapeamento -
 * por ora este modulo so expoe a leitura do e-SUS.
 */
export interface AgendamentoFuturo {
  cod_agendamento: number;
  data_hora_agendado: Date;
  observacao: string;
  cod_prontuario: number;
  cod_paciente: number;
  cns_paciente: string;
  cpf_paciente: string;
  paciente: string;
  mae: string;
  dtnasc_paciente: string;
  sexo_paciente: string;
  cod_lotacao: number;
  cod_ator: number;
  cod_prof: number;
  cns_profissional: string;
  cpf_profissional: string;
  profissional: string;
  sexo_profissional: string;
  cod_cbo: string;
  cbo: string;
  cod_unidadesaude: number;
  cnes: string;
  unidadesaude: string;
}

/**
 * Busca agendamentos futuros (dt_agendado >= hoje, st_agendado = 0 =
 * agendamento ativo/nao cancelado/nao atendido) no e-SUS. Consulta somente
 * leitura, sem nenhum insert/update/delete.
 */
export async function fetchAgendamentosFuturos(pool: Pool): Promise<AgendamentoFuturo[]> {
  const sql = `
    select
      agendado.co_seq_agendado as cod_agendamento,
      agendado.hr_inicial_agendado as data_hora_agendado,
      coalesce(agendado.ds_observacao, '') as observacao,
      coalesce(agendado.co_prontuario, 0) as cod_prontuario,
      coalesce(paciente.co_seq_cidadao, 0) as cod_paciente,
      coalesce(paciente.nu_cns, '') as cns_paciente,
      coalesce(paciente.nu_cpf, '') as cpf_paciente,
      upper(trim(coalesce(paciente.no_cidadao, ''))) as paciente,
      coalesce(paciente.no_mae, '') as mae,
      to_char(coalesce(paciente.dt_nascimento, current_date), 'DD/MM/YYYY')::text as dtnasc_paciente,
      substring(coalesce(paciente.no_sexo, ''), 1, 1) as sexo_paciente,
      coalesce(agendado.co_lotacao_agendada, 0) as cod_lotacao,
      coalesce(lotacao.co_ator_papel, 0) as cod_ator,
      coalesce(lotacao.co_prof, 0) as cod_prof,
      coalesce(profissional.nu_cns, '') as cns_profissional,
      coalesce(profissional.nu_cpf, '') as cpf_profissional,
      upper(trim(coalesce(profissional.no_civil_profissional, ''))) as profissional,
      coalesce(profissional.no_sexo, '') as sexo_profissional,
      coalesce(cbo.co_cbo_2002, '') as cod_cbo,
      coalesce(cbo.no_cbo, '') as cbo,
      coalesce(unidadesaude.co_seq_unidade_saude, 0) as cod_unidadesaude,
      coalesce(unidadesaude.nu_cnes, '') as cnes,
      upper(trim(coalesce(unidadesaude.no_unidade_saude, ''))) as unidadesaude
    from
                  public.tb_agendado as agendado
      left  join    public.tb_prontuario as prontuario     on    prontuario.co_seq_prontuario = agendado.co_prontuario
      left  join      public.tb_cidadao as paciente        on    paciente.co_seq_cidadao = prontuario.co_cidadao
      left  join    public.tb_lotacao as lotacao           on    lotacao.co_ator_papel = agendado.co_lotacao_agendada
      left  join      public.tb_prof as profissional       on    profissional.co_seq_prof = lotacao.co_prof
      left  join      public.tb_cbo as cbo                 on    cbo.co_cbo = lotacao.co_cbo
      left  join      public.tb_unidade_saude as unidadesaude on unidadesaude.co_seq_unidade_saude = lotacao.co_unidade_saude
    where
          1 = 1
      and agendado.dt_agendado >= current_date
      and agendado.st_agendado = 0
    order by
      agendado.hr_inicial_agendado asc
  `;
  const result = await pool.query<AgendamentoFuturo>(sql);
  return result.rows;
}
