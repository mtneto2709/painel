import { TokenOtpService } from "./token-otp.service";

describe("TokenOtpService", () => {
  let service: TokenOtpService;

  beforeEach(() => {
    service = new TokenOtpService();
  });

  it("gera códigos numéricos com o tamanho configurado", () => {
    for (let i = 0; i < 50; i++) {
      const codigo = service.gerarCodigo();
      expect(codigo).toMatch(/^\d{6}$/);
    }
  });

  it("gera códigos com boa variabilidade (não sempre o mesmo valor)", () => {
    const codigos = new Set(Array.from({ length: 20 }, () => service.gerarCodigo()));
    expect(codigos.size).toBeGreaterThan(1);
  });

  it("hash é determinístico para o mesmo código", () => {
    const codigo = "123456";
    expect(service.hash(codigo)).toBe(service.hash(codigo));
  });

  it("hash de códigos diferentes produz valores diferentes", () => {
    expect(service.hash("123456")).not.toBe(service.hash("654321"));
  });

  it("comparar retorna true apenas para o código correto", () => {
    const codigo = "482910";
    const hash = service.hash(codigo);
    expect(service.comparar(codigo, hash)).toBe(true);
    expect(service.comparar("000000", hash)).toBe(false);
  });

  it("maxTentativas é um limite positivo razoável", () => {
    expect(service.maxTentativas).toBeGreaterThan(0);
    expect(service.maxTentativas).toBeLessThanOrEqual(10);
  });
});
