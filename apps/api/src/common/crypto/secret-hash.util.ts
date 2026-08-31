import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** Gera um hash scrypt (com salt aleatorio) de um segredo, para armazenamento seguro. */
export function gerarHashSegredo(segredo: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(segredo, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Compara um segredo em claro com um hash gerado por `gerarHashSegredo`. */
export function verificarHashSegredo(segredo: string, hashArmazenado: string): boolean {
  const [saltHex, hashHex] = hashArmazenado.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const hashEsperado = Buffer.from(hashHex, "hex");
  const hashCalculado = scryptSync(segredo, salt, 64);
  if (hashCalculado.length !== hashEsperado.length) return false;
  return timingSafeEqual(hashCalculado, hashEsperado);
}

/** Gera um par (id publico, segredo) para autenticacao client-credentials. */
export function gerarParApiKey(): { apiKeyId: string; apiSecret: string } {
  const apiKeyId = `ak_${randomBytes(8).toString("hex")}`;
  const apiSecret = `as_${randomBytes(24).toString("hex")}`;
  return { apiKeyId, apiSecret };
}
