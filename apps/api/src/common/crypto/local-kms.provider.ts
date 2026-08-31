import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { KmsProvider } from "./kms.provider.interface";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Implementacao local (dev/self-hosted) do KmsProvider usando AES-256-GCM
 * com uma chave mestre derivada de `KMS_LOCAL_KEY` (variavel de ambiente).
 *
 * Para producao, substitua o binding de `KMS_PROVIDER` no CryptoModule por
 * um provider que delegue a um KMS gerenciado (AWS KMS, Vault, GCP KMS).
 */
@Injectable()
export class LocalKmsProvider implements KmsProvider {
  private readonly key: Buffer;

  constructor() {
    const secret = process.env.KMS_LOCAL_KEY;
    if (!secret) {
      throw new Error(
        "KMS_LOCAL_KEY nao configurada. Defina uma chave mestre em .env para criptografia local (ver .env.example).",
      );
    }
    this.key = scryptSync(secret, "atendvalida-kms-salt", 32);
  }

  async encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  async decrypt(envelope: string): Promise<string> {
    const raw = Buffer.from(envelope, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
}
