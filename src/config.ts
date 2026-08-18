import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const sslModeSchema = z.enum(["disable", "require", "prefer"]).default("require");

const envSchema = z.object({
  ESUS_DB_HOST: z.string().min(1, "ESUS_DB_HOST e obrigatorio"),
  ESUS_DB_PORT: z.coerce.number().int().positive().default(5432),
  ESUS_DB_NAME: z.string().min(1, "ESUS_DB_NAME e obrigatorio"),
  ESUS_DB_USER: z.string().min(1, "ESUS_DB_USER e obrigatorio"),
  ESUS_DB_PASSWORD: z.string().min(1, "ESUS_DB_PASSWORD e obrigatorio"),
  ESUS_DB_SSL_MODE: sslModeSchema,

  IS_DB_HOST: z.string().min(1, "IS_DB_HOST e obrigatorio"),
  IS_DB_PORT: z.coerce.number().int().positive().default(5432),
  IS_DB_NAME: z.string().min(1, "IS_DB_NAME e obrigatorio"),
  IS_DB_USER: z.string().min(1, "IS_DB_USER e obrigatorio"),
  IS_DB_PASSWORD: z.string().min(1, "IS_DB_PASSWORD e obrigatorio"),
  IS_DB_SSL_MODE: sslModeSchema,

  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  POLL_BATCH_SIZE: z.coerce.number().int().positive().default(200),
  STATE_DB_PATH: z.string().default("./data/state.db"),
  SYNC_DRY_RUN: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  HEALTH_PORT: z.coerce.number().int().positive().default(3000),
});

export type AppConfig = ReturnType<typeof buildConfig>;

function buildConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuracao invalida:\n${issues}`);
  }
  const env = parsed.data;

  return {
    esus: {
      host: env.ESUS_DB_HOST,
      port: env.ESUS_DB_PORT,
      database: env.ESUS_DB_NAME,
      user: env.ESUS_DB_USER,
      password: env.ESUS_DB_PASSWORD,
      sslMode: env.ESUS_DB_SSL_MODE,
    },
    is: {
      host: env.IS_DB_HOST,
      port: env.IS_DB_PORT,
      database: env.IS_DB_NAME,
      user: env.IS_DB_USER,
      password: env.IS_DB_PASSWORD,
      sslMode: env.IS_DB_SSL_MODE,
    },
    poll: {
      intervalMs: env.POLL_INTERVAL_MS,
      batchSize: env.POLL_BATCH_SIZE,
    },
    stateDbPath: env.STATE_DB_PATH,
    dryRun: env.SYNC_DRY_RUN,
    logLevel: env.LOG_LEVEL,
    healthPort: env.HEALTH_PORT,
  };
}

export const appConfig = buildConfig();
