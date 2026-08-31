import { MaskService } from "./mask.service";

describe("MaskService", () => {
  const service = new MaskService();

  it("mascara telefone mantendo apenas os últimos 4 dígitos", () => {
    expect(service.telefone("+5585999887766")).toBe("****7766");
  });

  it("mascara telefone curto/inválido com padrão seguro", () => {
    expect(service.telefone("12")).toBe("****");
  });

  it("mascara hash de documento mostrando só um trecho", () => {
    expect(service.documento("a94a8fe5ccb19ba61c4c0873d391e987982fbbd3")).toBe("a94a8f...");
  });

  it("mascara documento vazio", () => {
    expect(service.documento("")).toBe("****");
  });
});
