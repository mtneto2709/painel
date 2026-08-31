import { generateKeyPairSync } from "crypto";
import { SignatureService } from "./signature.service";

describe("SignatureService", () => {
  let service: SignatureService;

  beforeAll(() => {
    const { privateKey } = generateKeyPairSync("ed25519");
    process.env.ED25519_PRIVATE_KEY = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    service = new SignatureService();
  });

  it("gera o mesmo hash para payloads equivalentes com chaves em ordens diferentes", () => {
    const a = { b: 2, a: 1, c: { y: 2, x: 1 } };
    const b = { a: 1, c: { x: 1, y: 2 }, b: 2 };
    expect(service.hashPayload(a)).toBe(service.hashPayload(b));
  });

  it("gera hashes diferentes para payloads diferentes", () => {
    expect(service.hashPayload({ a: 1 })).not.toBe(service.hashPayload({ a: 2 }));
  });

  it("assina um hash e verifica a assinatura com sucesso", () => {
    const hash = service.hashPayload({ validacao_id: "abc", status: "confirmado" });
    const assinatura = service.assinarHash(hash);
    expect(service.verificar(hash, assinatura)).toBe(true);
  });

  it("rejeita assinatura quando o payload foi adulterado", () => {
    const hashOriginal = service.hashPayload({ status: "confirmado" });
    const assinatura = service.assinarHash(hashOriginal);
    const hashAdulterado = service.hashPayload({ status: "rejeitado" });
    expect(service.verificar(hashAdulterado, assinatura)).toBe(false);
  });

  it("rejeita assinatura corrompida sem lançar exceção", () => {
    const hash = service.hashPayload({ status: "confirmado" });
    expect(service.verificar(hash, "assinatura-invalida-nao-base64-valida")).toBe(false);
  });

  it("exporta uma chave pública em formato PEM", () => {
    expect(service.exportarChavePublica()).toContain("BEGIN PUBLIC KEY");
  });
});
