import { generateKeyPairSync } from "crypto";

/**
 * Configura variáveis de ambiente para os testes de integração (e2e),
 * usando um banco de dados isolado (atendvalida_test) para não colidir
 * com dados de desenvolvimento.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://atendvalida:atendvalida@localhost:5432/atendvalida_test?schema=public";
// Usa um índice de banco Redis dedicado (1) para não competir por filas
// BullMQ com uma instância da API rodando em paralelo (ex.: `pnpm dev:api`),
// já que o nome das filas é o mesmo independentemente do ambiente.
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? "redis://localhost:6379/1";
process.env.JWT_SECRET = "teste-jwt-secret";
process.env.JWT_EXPIRES_IN_SECONDS = "900";
process.env.KMS_LOCAL_KEY = "teste-kms-local-key";
process.env.OPERATOR_TOKEN = "teste-operator-token";
process.env.CORS_ORIGINS = "*";
process.env.STORAGE_DIR = "/tmp/atendvalida-test-storage";

if (!process.env.ED25519_PRIVATE_KEY) {
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.ED25519_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}
