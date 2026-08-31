import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { MetodoValidacao } from "@atendvalida/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { AuditoriaService } from "../common/audit/auditoria.service";
import { KMS_PROVIDER, KmsProvider } from "../common/crypto/kms.provider.interface";
import { gerarHashSegredo, gerarParApiKey } from "../common/crypto/secret-hash.util";
import { CriarTenantDto } from "./dto/criar-tenant.dto";
import { ConfigurarMetodoDto } from "./dto/configurar-metodo.dto";

const CHAVES_SENSIVEIS = ["token", "senha", "secret", "chave", "credencial", "api_key", "key"];

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    @Inject(KMS_PROVIDER) private readonly kms: KmsProvider,
  ) {}

  async criar(dto: CriarTenantDto) {
    const { apiKeyId, apiSecret } = gerarParApiKey();
    const apiKeyHash = gerarHashSegredo(apiSecret);

    const tenant = await this.prisma.tenant.create({
      data: {
        nome: dto.nome,
        emailContato: dto.email_contato,
        apiKeyId,
        apiKeyHash,
        metodos: {
          create: Object.values(MetodoValidacao).map((metodo) => ({
            metodo,
            ativo: false,
            configurado: false,
            configuracao: {},
          })),
        },
      },
    });

    await this.auditoria.registrar({
      tenantId: tenant.id,
      ator: "operador",
      acao: "tenant.criado",
      entidade: "tenant",
      entidadeId: tenant.id,
      detalhes: { nome: tenant.nome },
    });

    return {
      id: tenant.id,
      nome: tenant.nome,
      api_key_id: apiKeyId,
      api_secret: apiSecret,
    };
  }

  async buscarPorId(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({ status: "nao_encontrado", mensagem: "Tenant nao encontrado." });
    }
    return tenant;
  }

  async listarMetodos(tenantId: string) {
    await this.buscarPorId(tenantId);
    const metodos = await this.prisma.tenantValidationMethod.findMany({
      where: { tenantId },
      orderBy: [{ metodo: "asc" }, { procedimentoTipo: "asc" }],
    });
    return metodos.map((m) => ({
      metodo: m.metodo,
      ativo: m.ativo,
      configurado: m.configurado,
      procedimento_tipo: m.procedimentoTipo || null,
      configuracao: this.mascarar(m.configuracao as Record<string, unknown>),
      atualizado_em: m.atualizadoEm,
    }));
  }

  async configurarMetodo(tenantId: string, metodo: MetodoValidacao, dto: ConfigurarMetodoDto) {
    await this.buscarPorId(tenantId);
    const procedimentoTipo = dto.procedimento_tipo ?? "";
    const configuracaoCriptografada = await this.criptografarSegredos(dto.configuracao ?? {});
    const configurado = Object.keys(dto.configuracao ?? {}).length > 0;

    const registro = await this.prisma.tenantValidationMethod.upsert({
      where: { tenantId_metodo_procedimentoTipo: { tenantId, metodo, procedimentoTipo } },
      create: {
        tenantId,
        metodo,
        ativo: dto.ativo,
        configuracao: configuracaoCriptografada,
        configurado,
        procedimentoTipo,
      },
      update: {
        ativo: dto.ativo,
        ...(dto.configuracao ? { configuracao: configuracaoCriptografada, configurado } : {}),
      },
    });

    await this.auditoria.registrar({
      tenantId,
      ator: `tenant:${tenantId}`,
      acao: "tenant.metodo_configurado",
      entidade: "tenant_validation_method",
      entidadeId: registro.id,
      detalhes: { metodo, ativo: dto.ativo, procedimento_tipo: procedimentoTipo || null },
    });

    return {
      metodo: registro.metodo,
      ativo: registro.ativo,
      configurado: registro.configurado,
      procedimento_tipo: registro.procedimentoTipo || null,
    };
  }

  async rotacionarApiKey(tenantId: string) {
    const tenant = await this.buscarPorId(tenantId);
    const { apiSecret } = gerarParApiKey();
    const apiKeyHash = gerarHashSegredo(apiSecret);
    await this.prisma.tenant.update({ where: { id: tenant.id }, data: { apiKeyHash } });

    await this.auditoria.registrar({
      tenantId,
      ator: "operador",
      acao: "tenant.api_key_rotacionada",
      entidade: "tenant",
      entidadeId: tenant.id,
    });

    return { id: tenant.id, api_key_id: tenant.apiKeyId, api_secret: apiSecret };
  }

  /**
   * Resolve qual metodo/configuracao usar para uma validacao, considerando
   * regras por procedimento (mais especifica) com fallback para a regra
   * geral do tenant (procedimento_tipo vazio).
   */
  async resolverMetodo(
    tenantId: string,
    metodoPreferido: MetodoValidacao | undefined,
    procedimentoTipo: string | undefined,
  ) {
    const todos = await this.prisma.tenantValidationMethod.findMany({ where: { tenantId } });
    const ativos = todos.filter((m) => m.ativo);

    const porProcedimento = (metodo: MetodoValidacao) =>
      ativos.find((m) => m.metodo === metodo && m.procedimentoTipo === (procedimentoTipo ?? "")) ??
      ativos.find((m) => m.metodo === metodo && m.procedimentoTipo === "");

    if (metodoPreferido) {
      const encontrado = porProcedimento(metodoPreferido);
      return { registro: encontrado ?? null, disponiveis: this.metodosDisponiveis(ativos, procedimentoTipo) };
    }

    for (const metodo of Object.values(MetodoValidacao)) {
      const encontrado = porProcedimento(metodo);
      if (encontrado) {
        return { registro: encontrado, disponiveis: this.metodosDisponiveis(ativos, procedimentoTipo) };
      }
    }
    return { registro: null, disponiveis: this.metodosDisponiveis(ativos, procedimentoTipo) };
  }

  private metodosDisponiveis(
    ativos: Array<{ metodo: MetodoValidacao; procedimentoTipo: string }>,
    procedimentoTipo: string | undefined,
  ): MetodoValidacao[] {
    const disponiveis = new Set<MetodoValidacao>();
    for (const registro of ativos) {
      if (registro.procedimentoTipo === "" || registro.procedimentoTipo === (procedimentoTipo ?? "")) {
        disponiveis.add(registro.metodo);
      }
    }
    return Array.from(disponiveis);
  }

  private async criptografarSegredos(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resultado: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(config)) {
      const ehSensivel = CHAVES_SENSIVEIS.some((s) => chave.toLowerCase().includes(s));
      if (ehSensivel && typeof valor === "string") {
        resultado[chave] = `enc:${await this.kms.encrypt(valor)}`;
      } else {
        resultado[chave] = valor;
      }
    }
    return resultado;
  }

  private mascarar(config: Record<string, unknown>): Record<string, unknown> {
    const resultado: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(config ?? {})) {
      if (typeof valor === "string" && valor.startsWith("enc:")) {
        resultado[chave] = "••••••••";
      } else {
        resultado[chave] = valor;
      }
    }
    return resultado;
  }

  async descriptografarConfig(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resultado: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(config ?? {})) {
      if (typeof valor === "string" && valor.startsWith("enc:")) {
        resultado[chave] = await this.kms.decrypt(valor.slice(4));
      } else {
        resultado[chave] = valor;
      }
    }
    return resultado;
  }
}
