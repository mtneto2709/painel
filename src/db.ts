import { Pool, type PoolClient } from "pg";
import { appConfig } from "./config";
import { logger } from "./logger";

function sslOption(mode: "disable" | "require" | "prefer") {
  if (mode === "disable") return false;
  // "require"/"prefer": exige TLS mas nao valida a CA (comum em bancos
  // gerenciados com certificado proprio). Ajuste para { rejectUnauthorized: true, ca: ... }
  // caso a CA do servidor esteja disponivel.
  return { rejectUnauthorized: false };
}

/**
 * Pool de conexao com o banco do e-SUS (ORIGEM).
 * Toda conexao obtida deste pool tem a sessao forcada para READ ONLY,
 * garantindo em nivel de aplicacao que nenhuma escrita ocorre no e-SUS
 * mesmo que o usuario configurado tenha permissao alem de SELECT.
 */
export const esusPool = new Pool({
  host: appConfig.esus.host,
  port: appConfig.esus.port,
  database: appConfig.esus.database,
  user: appConfig.esus.user,
  password: appConfig.esus.password,
  ssl: sslOption(appConfig.esus.sslMode),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

esusPool.on("connect", (client: PoolClient) => {
  client.query("SET default_transaction_read_only = on").catch((err) => {
    logger.error({ err }, "Falha ao forcar sessao READ ONLY no pool do e-SUS");
  });
});

esusPool.on("error", (err) => {
  logger.error({ err }, "Erro no pool de conexoes do e-SUS");
});

/**
 * Pool de conexao com o banco do Sistema IS (DESTINO).
 * Usado apenas para chamar a funcao existente sotech.esus_criar_chamada,
 * sem nenhuma alteracao de estrutura.
 */
export const isPool = new Pool({
  host: appConfig.is.host,
  port: appConfig.is.port,
  database: appConfig.is.database,
  user: appConfig.is.user,
  password: appConfig.is.password,
  ssl: sslOption(appConfig.is.sslMode),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

isPool.on("error", (err) => {
  logger.error({ err }, "Erro no pool de conexoes do IS");
});

export async function closePools(): Promise<void> {
  await Promise.allSettled([esusPool.end(), isPool.end()]);
}
