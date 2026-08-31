import { gerarHashSegredo, gerarParApiKey, verificarHashSegredo } from "./secret-hash.util";

describe("secret-hash.util", () => {
  it("verifica corretamente um segredo válido", () => {
    const segredo = "as_segredo-super-secreto-123";
    const hash = gerarHashSegredo(segredo);
    expect(verificarHashSegredo(segredo, hash)).toBe(true);
  });

  it("rejeita um segredo incorreto", () => {
    const hash = gerarHashSegredo("segredo-correto");
    expect(verificarHashSegredo("segredo-errado", hash)).toBe(false);
  });

  it("gera hashes diferentes (salt aleatório) para o mesmo segredo", () => {
    const segredo = "mesmo-segredo";
    expect(gerarHashSegredo(segredo)).not.toBe(gerarHashSegredo(segredo));
  });

  it("gerarParApiKey produz identificadores com prefixos esperados", () => {
    const { apiKeyId, apiSecret } = gerarParApiKey();
    expect(apiKeyId.startsWith("ak_")).toBe(true);
    expect(apiSecret.startsWith("as_")).toBe(true);
  });

  it("retorna false para hash armazenado malformado", () => {
    expect(verificarHashSegredo("qualquer", "hash-sem-separador")).toBe(false);
  });
});
