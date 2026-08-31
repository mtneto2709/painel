import { MetodoValidacao } from "@atendvalida/shared-types";
import { TenantsService } from "./tenants.service";

function criarPrismaFake(registros: any[]) {
  return {
    tenantValidationMethod: {
      findMany: jest.fn().mockResolvedValue(registros),
    },
  } as any;
}

describe("TenantsService.resolverMetodo", () => {
  const auditoriaFake = { registrar: jest.fn() } as any;
  const kmsFake = { encrypt: jest.fn(), decrypt: jest.fn() } as any;

  it("usa a regra específica do procedimento quando existir, ignorando a regra geral", () => {
    const registros = [
      { metodo: MetodoValidacao.TOKEN_WHATSAPP, ativo: true, procedimentoTipo: "" },
      { metodo: MetodoValidacao.TOKEN_WHATSAPP, ativo: true, procedimentoTipo: "Exame X" },
    ];
    const service = new TenantsService(criarPrismaFake(registros), auditoriaFake, kmsFake);

    return service.resolverMetodo("tenant1", MetodoValidacao.TOKEN_WHATSAPP, "Exame X").then((r) => {
      expect(r.registro?.procedimentoTipo).toBe("Exame X");
    });
  });

  it("cai para a regra geral (procedimento vazio) quando não há regra específica", async () => {
    const registros = [{ metodo: MetodoValidacao.TOKEN_WHATSAPP, ativo: true, procedimentoTipo: "" }];
    const service = new TenantsService(criarPrismaFake(registros), auditoriaFake, kmsFake);

    const r = await service.resolverMetodo("tenant1", MetodoValidacao.TOKEN_WHATSAPP, "Exame Y");
    expect(r.registro?.procedimentoTipo).toBe("");
  });

  it("retorna registro nulo quando o método preferido não está ativo", async () => {
    const registros = [{ metodo: MetodoValidacao.ASSINATURA_TELA, ativo: false, procedimentoTipo: "" }];
    const service = new TenantsService(criarPrismaFake(registros), auditoriaFake, kmsFake);

    const r = await service.resolverMetodo("tenant1", MetodoValidacao.ASSINATURA_TELA, undefined);
    expect(r.registro).toBeNull();
  });

  it("sem método preferido, escolhe o primeiro método ativo na ordem do enum", async () => {
    const registros = [
      { metodo: MetodoValidacao.BIOMETRIA_FACIAL, ativo: true, procedimentoTipo: "" },
      { metodo: MetodoValidacao.TOKEN_WHATSAPP, ativo: true, procedimentoTipo: "" },
    ];
    const service = new TenantsService(criarPrismaFake(registros), auditoriaFake, kmsFake);

    const r = await service.resolverMetodo("tenant1", undefined, undefined);
    expect(r.registro?.metodo).toBe(MetodoValidacao.TOKEN_WHATSAPP);
  });

  it("retorna null quando nenhum método está ativo", async () => {
    const registros = [{ metodo: MetodoValidacao.TOKEN_WHATSAPP, ativo: false, procedimentoTipo: "" }];
    const service = new TenantsService(criarPrismaFake(registros), auditoriaFake, kmsFake);

    const r = await service.resolverMetodo("tenant1", undefined, undefined);
    expect(r.registro).toBeNull();
    expect(r.disponiveis).toEqual([]);
  });
});
