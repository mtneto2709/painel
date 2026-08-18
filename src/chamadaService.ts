import type { Pool } from "pg";
import type { AtendimentoPayload } from "./esusQueries";

/**
 * Chama a funcao sotech.esus_criar_chamada, ja existente no banco do IS,
 * exatamente como o e-SUS fazia via dblink. Nenhuma estrutura do IS e
 * criada ou alterada por esta aplicacao - apenas reaproveitamos a funcao.
 */
export async function enviarChamada(pool: Pool, payload: AtendimentoPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const result = await pool.query<{ retorno: string }>(
    "select sotech.esus_criar_chamada($1) as retorno",
    [json],
  );
  return result.rows[0]?.retorno ?? "";
}
