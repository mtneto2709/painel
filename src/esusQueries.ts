import type { Pool } from "pg";

/** Linha de mudanca de status detectada pelo polling (substitui o OLD/NEW da trigger). */
export interface StatusChangeRow {
  cod_atendimento: number;
  cod_status: number;
  status_atendimento: string;
  data_alteracao_status: Date;
}

/**
 * Busca no e-SUS (leitura pura) todas as mudancas de status de atendimento
 * ocorridas apos o watermark informado. Equivalente a "o que a trigger
 * teria visto", mas obtido por consulta periodica em vez de AFTER UPDATE.
 */
export async function fetchStatusChangesSince(
  pool: Pool,
  since: Date,
  limit: number,
): Promise<StatusChangeRow[]> {
  const sql = `
    select
      atendimento.co_seq_atend as cod_atendimento,
      atendimento.st_atend as cod_status,
      upper(trim(status_atendimento.no_identificador)) as status_atendimento,
      atendimento.dt_ultima_alteracao_status as data_alteracao_status
    from
                  public.tb_atend as atendimento
      inner join    public.tb_status_atend as status_atendimento on status_atendimento.co_status_atend = atendimento.st_atend
    where
          1 = 1
      and atendimento.dt_ultima_alteracao_status > $1
    order by
      atendimento.dt_ultima_alteracao_status asc,
      atendimento.co_seq_atend asc
    limit $2
  `;
  const result = await pool.query<StatusChangeRow>(sql, [since.toISOString(), limit]);
  return result.rows;
}

/** Payload no mesmo formato que a funcao sotech.esus_criar_chamada espera receber via JSON. */
export interface AtendimentoPayload {
  cod_atendimento: number;
  data_atendimento: string;
  data_alteracao_status: string;
  status_atendimento: string;
  cod_unidadesaude: number;
  cnes: string;
  unidadesaude: string;
  cod_paciente: number;
  cns_paciente: string;
  cpf_paciente: string;
  paciente: string;
  mae: string;
  dtnasc_paciente: string;
  sexo_paciente: string;
  cod_atendimento_prof: number;
  tipo_atendimento_prof: string;
  consultorio: string;
  cod_profissional: number;
  cns_profissional: string;
  cpf_profissional: string;
  profissional: string;
  sexo_profissional: string;
  cod_cbo: string;
  cbo: string;
}

/**
 * Reproduz fielmente a consulta usada por public.tb_atend_chamar no e-SUS
 * original, obtendo todos os dados necessarios para acionar a chamada no IS.
 * E uma consulta somente leitura (nenhum insert/update/delete).
 */
export async function fetchAtendimentoDetalhado(
  pool: Pool,
  codAtendimento: number,
): Promise<AtendimentoPayload | null> {
  const sql = `
    with
      atendimento_profissional as
      (
        select
          public.tb_atend_prof.co_atend as cod_atendimento,
          max(public.tb_atend_prof.co_seq_atend_prof) as cod_atendimento_profissional
        from
          public.tb_atend_prof
        where
              1 = 1
          and public.tb_atend_prof.co_atend = $1
        group by
          1
      )
    select distinct
      atendimento.co_seq_atend as cod_atendimento,
      to_char(atendimento.dt_inicio, 'DD/MM/YYYY HH:MM:SS')::text as data_atendimento,
      to_char(atendimento.dt_ultima_alteracao_status, 'DD/MM/YYYY HH:MM:SS')::text as data_alteracao_status,
      upper(trim(status_atendimento.no_identificador)) as status_atendimento,
      coalesce(unidadesaude.co_seq_unidade_saude, 0) as cod_unidadesaude,
      coalesce(unidadesaude.nu_cnes, '') as cnes,
      upper(trim(coalesce(unidadesaude.no_unidade_saude, ''))) as unidadesaude,
      coalesce(paciente.co_seq_cidadao, 0) as cod_paciente,
      coalesce(paciente.nu_cns, '') as cns_paciente,
      coalesce(paciente.nu_cpf, '') as cpf_paciente,
      upper(trim(coalesce(paciente.no_cidadao, ''))) as paciente,
      coalesce(paciente.no_mae, '') as mae,
      to_char(coalesce(paciente.dt_nascimento, current_date), 'DD/MM/YYYY')::text as dtnasc_paciente,
      substring(coalesce(paciente.no_sexo, ''), 1, 1) as sexo_paciente,
      coalesce(atendimento_prof.co_seq_atend_prof, 0) as cod_atendimento_prof,
      coalesce(tipo_atendimento_prof.no_tipo_atend_prof, '') as tipo_atendimento_prof,
      concat
      (
        case tipo_atendimento_prof.no_tipo_atend_prof
          when 'CONSULTA'                     then 'CONSULTÓRIO MÉDICO'
          when 'ESCUTA INICIAL'               then 'SALA DE ENFERMAGEM'
          when 'CONSULTA ODONTOLÓGICA'        then 'CONSULTÓRIO ODONTOLÓGICO'
          when 'PRÉ-NATAL'                    then 'CONSULTÓRIO MÉDICO'
          when 'PUERPÉRIO'                    then 'CONSULTÓRIO MÉDICO'
          when 'ATENDIMENTO DE PROCEDIMENTO'  then 'SALA DE PROCEDIMENTOS'
          when 'PUERICULTURA'                 then 'SALA DE PROCEDIMENTOS'
          when 'VACINAÇÃO'                    then 'SALA DE VACINAÇÂO'
          when 'ZIKA / MICROCEFALIA'          then 'SALA DE PROCEDIMENTOS'
          when 'OBSERVAÇÂO'                   then 'SALA DE OBSERVAÇÃO'
          else 'CONSULTÓRIO MÉDICO'
        end,
        ' COM ',
        profissional.no_profissional_filtro
      )::text as consultorio,
      coalesce(profissional.co_seq_prof, 0) as cod_profissional,
      coalesce(profissional.nu_cns, '') as cns_profissional,
      coalesce(profissional.nu_cpf, '') as cpf_profissional,
      upper(trim(coalesce(profissional.no_profissional_filtro, ''))) as profissional,
      coalesce(profissional.no_sexo, '') as sexo_profissional,
      coalesce(cbo.co_cbo_2002, '') as cod_cbo,
      coalesce(cbo.no_cbo, '') as cbo
    from
                  public.tb_atend as atendimento
      inner join    public.tb_status_atend as status_atendimento            on    status_atendimento.co_status_atend = atendimento.st_atend
      left  join    public.tb_unidade_saude as unidadesaude                 on    unidadesaude.co_seq_unidade_saude = atendimento.co_unidade_saude
      left  join    public.tb_prontuario as prontuario                      on    prontuario.co_seq_prontuario = atendimento.co_prontuario
      left  join      public.tb_cidadao as paciente                         on    paciente.co_seq_cidadao = prontuario.co_cidadao
      left  join    atendimento_profissional                                on    atendimento_profissional.cod_atendimento = atendimento.co_seq_atend
      left  join      public.tb_atend_prof as atendimento_prof              on    atendimento_prof.co_seq_atend_prof = atendimento_profissional.cod_atendimento_profissional
      left  join        public.tb_lotacao as lotacao                        on    lotacao.co_ator_papel = atendimento_prof.co_lotacao
      left  join          public.tb_prof as profissional                    on    profissional.co_seq_prof = lotacao.co_prof
      left  join          public.tb_cbo as cbo                              on    cbo.co_cbo = lotacao.co_cbo
      left  join        public.tb_tipo_atend_prof as tipo_atendimento_prof  on    tipo_atendimento_prof.co_tipo_atend_prof = atendimento_prof.tp_atend_prof
    where
          1 = 1
      and atendimento.co_seq_atend = $1
    order by
      atendimento.dt_ultima_alteracao_status desc
    limit
      1
  `;
  const result = await pool.query<AtendimentoPayload>(sql, [codAtendimento]);
  return result.rows[0] ?? null;
}
