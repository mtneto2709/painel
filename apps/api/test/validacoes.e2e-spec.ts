import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { NOTIFICACAO_ADAPTER } from "../src/validacoes/notificacao/notificacao-adapter.interface";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Testes de integração do fluxo principal: criação de tenant, emissão de
 * JWT, criação de validação por token, confirmação (certa/errada) e
 * verificação do comprovante assinado. Requer Postgres e Redis acessíveis
 * (ver docker-compose.yml e test/env-setup.ts).
 */
describe("Fluxo de validação por token (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const codigosEnviados: Record<string, string> = {};

  const adapterFalso = {
    enviarOtp: jest.fn(async (input: { telefone: string; codigo: string }) => {
      codigosEnviados[input.telefone] = input.codigo;
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICACAO_ADAPTER)
      .useValue(adapterFalso)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, errorHttpStatusCode: 422 }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix("v1", { exclude: ["/health"] });
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  async function criarTenantEAutenticar(nome: string) {
    const criarResp = await request(app.getHttpServer())
      .post("/v1/tenants")
      .set("x-operator-token", "teste-operator-token")
      .send({ nome })
      .expect(201);

    const { id, api_key_id: apiKeyId, api_secret: apiSecret } = criarResp.body;

    const authResp = await request(app.getHttpServer())
      .post("/v1/auth/token")
      .send({ api_key_id: apiKeyId, api_secret: apiSecret })
      .expect(200);
    const jwt = authResp.body.access_token as string;

    await request(app.getHttpServer())
      .put(`/v1/tenants/${id}/metodos/token_whatsapp`)
      .set("Authorization", `Bearer ${jwt}`)
      .send({ ativo: true })
      .expect(200);

    return { tenantId: id, jwt };
  }

  async function aguardarCodigo(telefone: string, tentativasMax = 20): Promise<string> {
    for (let i = 0; i < tentativasMax; i++) {
      if (codigosEnviados[telefone]) return codigosEnviados[telefone];
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Código OTP não foi enviado a tempo pelo worker de notificações.");
  }

  it("recusa autenticação com credenciais inválidas", async () => {
    const resp = await request(app.getHttpServer())
      .post("/v1/auth/token")
      .send({ api_key_id: "ak_inexistente", api_secret: "as_qualquer" });
    expect(resp.status).toBe(401);
    expect(resp.body.status).toBe("nao_autorizado");
  });

  it("cria validação, confirma código errado e depois o código correto, gerando comprovante assinado", async () => {
    const telefone = "+5585911112222";
    const { jwt } = await criarTenantEAutenticar("Clínica de Teste E2E");

    const criarResp = await request(app.getHttpServer())
      .post("/v1/validacoes")
      .set("Authorization", `Bearer ${jwt}`)
      .send({
        atendimento_id: "atd_e2e_1",
        paciente: { id_externo: "pac_e2e_1", nome: "Paciente Teste", telefone },
        metodo_preferido: "token_whatsapp",
      })
      .expect(201);

    expect(criarResp.body.status).toBe("aguardando");
    const validacaoId = criarResp.body.id;

    const codigo = await aguardarCodigo(telefone);

    const respErrada = await request(app.getHttpServer())
      .post(`/v1/validacoes/${validacaoId}/token/confirmar`)
      .send({ codigo_informado: "000000" })
      .expect(201);
    expect(respErrada.body.status).toBe("aguardando");
    expect(respErrada.body.tentativas).toBe(1);
    expect(respErrada.body.mensagem).toContain("Código incorreto");

    const respCerta = await request(app.getHttpServer())
      .post(`/v1/validacoes/${validacaoId}/token/confirmar`)
      .send({ codigo_informado: codigo })
      .expect(201);

    expect(respCerta.body.status).toBe("confirmado");
    expect(respCerta.body.comprovante).not.toBeNull();
    const comprovanteId = respCerta.body.comprovante.id;

    const verificarResp = await request(app.getHttpServer())
      .get(`/v1/comprovantes/${comprovanteId}/verificar`)
      .expect(200);
    expect(verificarResp.body.integro).toBe(true);
  }, 20000);

  it("bloqueia a validação após exceder o número máximo de tentativas", async () => {
    const telefone = "+5585933334444";
    const { jwt } = await criarTenantEAutenticar("Clínica Bloqueio E2E");

    const criarResp = await request(app.getHttpServer())
      .post("/v1/validacoes")
      .set("Authorization", `Bearer ${jwt}`)
      .send({
        atendimento_id: "atd_e2e_2",
        paciente: { id_externo: "pac_e2e_2", nome: "Paciente Teste 2", telefone },
        metodo_preferido: "token_whatsapp",
      })
      .expect(201);
    const validacaoId = criarResp.body.id;
    await aguardarCodigo(telefone);

    let ultimaResposta;
    for (let i = 0; i < 5; i++) {
      ultimaResposta = await request(app.getHttpServer())
        .post(`/v1/validacoes/${validacaoId}/token/confirmar`)
        .send({ codigo_informado: "999999" });
    }
    expect(ultimaResposta!.body.status).toBe("codigo_invalido");
  }, 20000);

  it("retorna 422 com metodo_nao_configurado quando o método preferido não está ativo", async () => {
    const { jwt } = await criarTenantEAutenticar("Clínica Sem SMS E2E");

    const resp = await request(app.getHttpServer())
      .post("/v1/validacoes")
      .set("Authorization", `Bearer ${jwt}`)
      .send({
        atendimento_id: "atd_e2e_3",
        paciente: { id_externo: "pac_e2e_3", nome: "Paciente Teste 3", telefone: "+5585955556666" },
        metodo_preferido: "token_sms",
      });

    expect(resp.status).toBe(422);
    expect(resp.body.status).toBe("metodo_nao_configurado");
    expect(resp.body.metodos_disponiveis).toContain("token_whatsapp");
  });

  it("retorna 503 ao enviar assinatura em tela (método ativo, porém stub não configurado)", async () => {
    const { tenantId, jwt } = await criarTenantEAutenticar("Clínica Assinatura E2E");

    await request(app.getHttpServer())
      .put(`/v1/tenants/${tenantId}/metodos/assinatura_tela`)
      .set("Authorization", `Bearer ${jwt}`)
      .send({ ativo: true })
      .expect(200);

    const criarResp = await request(app.getHttpServer())
      .post("/v1/validacoes")
      .set("Authorization", `Bearer ${jwt}`)
      .send({
        atendimento_id: "atd_e2e_4",
        paciente: { id_externo: "pac_e2e_4", nome: "Paciente Teste 4", telefone: "+5585977778888" },
        metodo_preferido: "assinatura_tela",
      })
      .expect(201);
    const validacaoId = criarResp.body.id;

    const respAssinatura = await request(app.getHttpServer())
      .post(`/v1/validacoes/${validacaoId}/assinatura`)
      .send({ imagem_base64: "data:image/png;base64,iVBORw0KGgo=" });

    expect(respAssinatura.status).toBe(503);
    expect(respAssinatura.body.status).toBe("metodo_nao_configurado");
    expect(respAssinatura.body.mensagem).toContain("não configurado");
  });
});
