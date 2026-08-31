import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { MetodoValidacao, StatusValidacao } from "@atendvalida/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { TenantsService } from "../tenants/tenants.service";
import { PacientesService } from "../pacientes/pacientes.service";
import { ConsentimentosService } from "../consentimentos/consentimentos.service";
import { ComprovantesService } from "../comprovantes/comprovantes.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AuditoriaService } from "../common/audit/auditoria.service";
import { RateLimitService } from "../common/rate-limit/rate-limit.service";
import { TokenOtpService } from "./token/token-otp.service";
import { AssinaturaProvider } from "./providers/assinatura.provider";
import { BiometriaProvider } from "./providers/biometria.provider";
import { CriarValidacaoDto } from "./dto/criar-validacao.dto";
import { EnviarAssinaturaDto } from "./dto/enviar-assinatura.dto";
import { EnviarBiometriaDto } from "./dto/enviar-biometria.dto";
import { FILA_NOTIFICACOES } from "../queue/queue.constants";
import { EnviarOtpJobData } from "./notificacao/notificacao.processor";

const EXPIRACAO_PADRAO_SEGUNDOS = 300;
const METODOS_TOKEN = [MetodoValidacao.TOKEN_WHATSAPP, MetodoValidacao.TOKEN_SMS];

export interface ContextoRequisicao {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ValidacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
    private readonly pacientesService: PacientesService,
    private readonly consentimentosService: ConsentimentosService,
    private readonly comprovantesService: ComprovantesService,
    private readonly webhooksService: WebhooksService,
    private readonly auditoria: AuditoriaService,
    private readonly rateLimit: RateLimitService,
    private readonly tokenOtp: TokenOtpService,
    private readonly assinaturaProvider: AssinaturaProvider,
    private readonly biometriaProvider: BiometriaProvider,
    @InjectQueue(FILA_NOTIFICACOES) private readonly filaNotificacoes: Queue,
  ) {}

  async criar(tenantId: string, dto: CriarValidacaoDto, contexto: ContextoRequisicao) {
    await this.rateLimit.consumirOuFalhar(`criar-validacao:tenant:${tenantId}`, 60, 60);
    if (contexto.ip) {
      await this.rateLimit.consumirOuFalhar(`criar-validacao:ip:${contexto.ip}`, 30, 60);
    }

    const paciente = await this.pacientesService.upsert(tenantId, dto.paciente);

    const { registro, disponiveis } = await this.tenantsService.resolverMetodo(
      tenantId,
      dto.metodo_preferido,
      dto.contexto?.procedimento,
    );

    if (!registro) {
      const validacaoRejeitada = await this.prisma.validacao.create({
        data: {
          tenantId,
          atendimentoId: dto.atendimento_id,
          pacienteId: paciente.id,
          metodo: dto.metodo_preferido ?? MetodoValidacao.TOKEN_WHATSAPP,
          status: StatusValidacao.METODO_NAO_CONFIGURADO,
          contexto: (dto.contexto ?? {}) as any,
          documentoReferenciaHash: dto.contexto?.documento_referencia_hash,
          metadataCaptura: this.montarMetadata(contexto),
        },
      });
      throw new UnprocessableEntityException({
        ...this.formatarResposta(validacaoRejeitada, disponiveis, {
          mensagem: dto.metodo_preferido
            ? `O método "${dto.metodo_preferido}" não está ativo para este tenant/procedimento.`
            : "Nenhum método de validação ativo foi encontrado para este tenant/procedimento.",
        }),
      });
    }

    const expiracaoSegundos = dto.expiracao_segundos ?? EXPIRACAO_PADRAO_SEGUNDOS;
    const expiraEm = new Date(Date.now() + expiracaoSegundos * 1000);

    const validacao = await this.prisma.validacao.create({
      data: {
        tenantId,
        atendimentoId: dto.atendimento_id,
        pacienteId: paciente.id,
        metodo: registro.metodo,
        status: StatusValidacao.AGUARDANDO,
        contexto: (dto.contexto ?? {}) as any,
        documentoReferenciaHash: dto.contexto?.documento_referencia_hash,
        expiraEm,
        metadataCaptura: this.montarMetadata(contexto),
      },
    });

    await this.auditoria.registrar({
      tenantId,
      ator: `tenant:${tenantId}`,
      acao: "validacao.criada",
      entidade: "validacao",
      entidadeId: validacao.id,
      detalhes: { metodo: registro.metodo, atendimento_id: dto.atendimento_id },
    });

    if (METODOS_TOKEN.includes(registro.metodo as MetodoValidacao)) {
      await this.iniciarEnvioToken(validacao.id, paciente.id, registro.metodo as MetodoValidacao);
    } else {
      // Assinatura/biometria: nao ha envio assincrono, o paciente interage direto na tela.
    }

    return this.formatarResposta(validacao, disponiveis);
  }

  async listarPorTenant(
    tenantId: string,
    filtros: { status?: StatusValidacao; metodo?: MetodoValidacao; dataInicio?: Date; dataFim?: Date },
    pagina: number,
    tamanhoPagina: number,
  ) {
    const where = {
      tenantId,
      ...(filtros.status ? { status: filtros.status } : {}),
      ...(filtros.metodo ? { metodo: filtros.metodo } : {}),
      ...(filtros.dataInicio || filtros.dataFim
        ? {
            criadoEm: {
              ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
              ...(filtros.dataFim ? { lte: filtros.dataFim } : {}),
            },
          }
        : {}),
    };

    const [total, itens] = await Promise.all([
      this.prisma.validacao.count({ where }),
      this.prisma.validacao.findMany({
        where,
        include: { comprovante: true, paciente: true },
        orderBy: { criadoEm: "desc" },
        skip: (pagina - 1) * tamanhoPagina,
        take: tamanhoPagina,
      }),
    ]);

    return {
      total,
      pagina,
      tamanho_pagina: tamanhoPagina,
      itens: itens.map((v) => ({
        ...this.formatarResposta(v, undefined, undefined, v.comprovante ?? null),
        paciente_nome: v.paciente.nome,
        paciente_telefone_mascarado: v.paciente.telefoneMascarado,
      })),
    };
  }

  async obterTenantEPaciente(id: string) {
    const validacao = await this.buscarOuFalhar(id);
    return { tenantId: validacao.tenantId, pacienteId: validacao.pacienteId };
  }

  async obter(id: string) {
    const validacao = await this.buscarOuFalhar(id);
    const comprovante = validacao.comprovante;
    return this.formatarResposta(validacao, undefined, undefined, comprovante ?? null);
  }

  async confirmarToken(id: string, codigoInformado: string, contexto: ContextoRequisicao) {
    await this.rateLimit.consumirOuFalhar(`confirmar-token:${id}`, 10, 60);
    const validacao = await this.buscarOuFalhar(id);
    this.garantirMetodo(validacao, METODOS_TOKEN);

    if (validacao.status === StatusValidacao.CONFIRMADO) {
      return this.formatarResposta(validacao, undefined, undefined, validacao.comprovante ?? null);
    }
    if (this.expirou(validacao)) {
      const atualizada = await this.atualizarStatus(validacao.id, StatusValidacao.EXPIRADO, contexto);
      await this.dispararWebhookTerminal(atualizada);
      return this.formatarResposta(atualizada, undefined, {
        mensagem: "O código expirou. Solicite um novo reenvio.",
      });
    }
    if (validacao.status === StatusValidacao.CODIGO_INVALIDO) {
      return this.formatarResposta(validacao, undefined, {
        mensagem: "Número máximo de tentativas excedido. Solicite um novo reenvio.",
      });
    }

    const correto =
      validacao.codigoHash !== null && this.tokenOtp.comparar(codigoInformado, validacao.codigoHash);

    if (!correto) {
      const tentativas = validacao.tentativas + 1;
      const esgotou = tentativas >= this.tokenOtp.maxTentativas;
      const atualizada = await this.prisma.validacao.update({
        where: { id: validacao.id },
        data: {
          tentativas,
          status: esgotou ? StatusValidacao.CODIGO_INVALIDO : StatusValidacao.AGUARDANDO,
          metadataCaptura: this.mesclarMetadata(validacao.metadataCaptura, contexto),
        },
      });
      if (esgotou) {
        await this.dispararWebhookTerminal(atualizada);
      }
      return this.formatarResposta(atualizada, undefined, {
        mensagem: esgotou
          ? "Número máximo de tentativas excedido. Solicite um novo reenvio."
          : `Código incorreto. Tentativas restantes: ${this.tokenOtp.maxTentativas - tentativas}.`,
      });
    }

    const confirmada = await this.prisma.validacao.update({
      where: { id: validacao.id },
      data: {
        status: StatusValidacao.CONFIRMADO,
        confirmadoEm: new Date(),
        metadataCaptura: this.mesclarMetadata(validacao.metadataCaptura, contexto),
      },
    });

    const comprovante = await this.comprovantesService.gerarParaValidacao(confirmada);
    await this.webhooksService.dispararEvento(confirmada.tenantId, "validacao.confirmada" as any, confirmada.id, {
      validacao_id: confirmada.id,
      atendimento_id: confirmada.atendimentoId,
      status: confirmada.status,
      comprovante_id: comprovante.id,
    });
    await this.auditoria.registrar({
      tenantId: confirmada.tenantId,
      ator: `paciente:${confirmada.pacienteId}`,
      acao: "validacao.confirmada",
      entidade: "validacao",
      entidadeId: confirmada.id,
    });

    return this.formatarResposta(confirmada, undefined, undefined, comprovante);
  }

  async reenviar(id: string, contexto: ContextoRequisicao) {
    await this.rateLimit.consumirOuFalhar(`reenviar:${id}`, 3, 600);
    const validacao = await this.buscarOuFalhar(id);
    this.garantirMetodo(validacao, METODOS_TOKEN);

    if (validacao.status === StatusValidacao.CONFIRMADO) {
      throw new BadRequestException({
        status: "erro_validacao",
        mensagem: "Esta validação já foi confirmada.",
      });
    }

    const expiraEm = new Date(Date.now() + EXPIRACAO_PADRAO_SEGUNDOS * 1000);
    const atualizada = await this.prisma.validacao.update({
      where: { id: validacao.id },
      data: {
        status: StatusValidacao.AGUARDANDO,
        tentativas: 0,
        expiraEm,
        metadataCaptura: this.mesclarMetadata(validacao.metadataCaptura, contexto),
      },
    });
    await this.iniciarEnvioToken(atualizada.id, atualizada.pacienteId, atualizada.metodo as MetodoValidacao);

    await this.auditoria.registrar({
      tenantId: atualizada.tenantId,
      ator: `paciente:${atualizada.pacienteId}`,
      acao: "validacao.token_reenviado",
      entidade: "validacao",
      entidadeId: atualizada.id,
    });

    return this.formatarResposta(atualizada);
  }

  async enviarAssinatura(id: string, _dto: EnviarAssinaturaDto, contexto: ContextoRequisicao) {
    const validacao = await this.buscarOuFalhar(id);
    this.garantirMetodo(validacao, [MetodoValidacao.ASSINATURA_TELA]);

    const resultado = await this.assinaturaProvider.processar();
    return this.tratarResultadoStub(validacao, resultado, contexto);
  }

  async enviarBiometria(id: string, dto: EnviarBiometriaDto, contexto: ContextoRequisicao) {
    const validacao = await this.buscarOuFalhar(id);
    this.garantirMetodo(validacao, [MetodoValidacao.BIOMETRIA_FACIAL]);

    const possuiConsentimento = await this.consentimentosService.possuiConsentimento(
      validacao.tenantId,
      validacao.pacienteId,
      "biometria_facial",
    );
    if (!possuiConsentimento) {
      throw new ForbiddenException({
        status: "erro_validacao",
        mensagem:
          "É necessário registrar o consentimento LGPD para biometria facial antes de enviar a captura.",
      });
    }
    void dto.consentimento_id;

    const resultado = await this.biometriaProvider.processar();
    return this.tratarResultadoStub(validacao, resultado, contexto);
  }

  private async tratarResultadoStub(
    validacao: Awaited<ReturnType<typeof this.buscarOuFalhar>>,
    resultado: { configurado: boolean; mensagem?: string },
    contexto: ContextoRequisicao,
  ) {
    if (!resultado.configurado) {
      const atualizada = await this.prisma.validacao.update({
        where: { id: validacao.id },
        data: {
          status: StatusValidacao.METODO_NAO_CONFIGURADO,
          metadataCaptura: this.mesclarMetadata(validacao.metadataCaptura, contexto),
        },
      });
      throw new ServiceUnavailableException({
        ...this.formatarResposta(atualizada, undefined, { mensagem: resultado.mensagem }),
      });
    }
    // Caminho reservado para quando um provider real estiver configurado.
    const confirmada = await this.prisma.validacao.update({
      where: { id: validacao.id },
      data: { status: StatusValidacao.CONFIRMADO, confirmadoEm: new Date() },
    });
    const comprovante = await this.comprovantesService.gerarParaValidacao(confirmada);
    return this.formatarResposta(confirmada, undefined, undefined, comprovante);
  }

  private async iniciarEnvioToken(validacaoId: string, pacienteId: string, metodo: MetodoValidacao) {
    const codigo = this.tokenOtp.gerarCodigo();
    const codigoHash = this.tokenOtp.hash(codigo);
    await this.prisma.validacao.update({ where: { id: validacaoId }, data: { codigoHash } });

    const canal = metodo === MetodoValidacao.TOKEN_SMS ? "sms" : "whatsapp";
    const jobData: EnviarOtpJobData = { validacaoId, pacienteId, codigo, canal };
    await this.filaNotificacoes.add("enviar-otp", jobData, { removeOnComplete: true, removeOnFail: 50 });
  }

  private async dispararWebhookTerminal(validacao: { id: string; tenantId: string; atendimentoId: string; status: string }) {
    const evento =
      validacao.status === StatusValidacao.EXPIRADO
        ? "validacao.expirada"
        : validacao.status === StatusValidacao.REJEITADO
          ? "validacao.rejeitada"
          : "validacao.erro";
    await this.webhooksService.dispararEvento(validacao.tenantId, evento as any, validacao.id, {
      validacao_id: validacao.id,
      atendimento_id: validacao.atendimentoId,
      status: validacao.status,
    });
  }

  private async atualizarStatus(id: string, status: StatusValidacao, contexto: ContextoRequisicao) {
    const validacao = await this.buscarOuFalhar(id);
    return this.prisma.validacao.update({
      where: { id },
      data: { status, metadataCaptura: this.mesclarMetadata(validacao.metadataCaptura, contexto) },
    });
  }

  private async buscarOuFalhar(id: string) {
    const validacao = await this.prisma.validacao.findUnique({
      where: { id },
      include: { comprovante: true },
    });
    if (!validacao) {
      throw new NotFoundException({ status: "nao_encontrado", mensagem: "Validação não encontrada." });
    }
    return validacao;
  }

  private garantirMetodo(validacao: { metodo: string }, permitidos: MetodoValidacao[]) {
    if (!permitidos.includes(validacao.metodo as MetodoValidacao)) {
      throw new BadRequestException({
        status: "erro_validacao",
        mensagem: `Esta operação não se aplica ao método "${validacao.metodo}" desta validação.`,
      });
    }
  }

  private expirou(validacao: { expiraEm: Date | null; status: string }): boolean {
    return Boolean(validacao.expiraEm && validacao.expiraEm.getTime() < Date.now());
  }

  private montarMetadata(contexto: ContextoRequisicao) {
    return { historico: [{ ip: contexto.ip ?? null, user_agent: contexto.userAgent ?? null, em: new Date().toISOString() }] };
  }

  private mesclarMetadata(atual: unknown, contexto: ContextoRequisicao) {
    const historico = Array.isArray((atual as any)?.historico) ? (atual as any).historico : [];
    return {
      historico: [
        ...historico,
        { ip: contexto.ip ?? null, user_agent: contexto.userAgent ?? null, em: new Date().toISOString() },
      ],
    };
  }

  private formatarResposta(
    validacao: {
      id: string;
      atendimentoId: string;
      status: string;
      metodo: string;
      criadoEm: Date;
      expiraEm: Date | null;
      confirmadoEm: Date | null;
      tentativas: number;
    },
    metodosDisponiveis?: MetodoValidacao[],
    override?: { mensagem?: string },
    comprovante?: { id: string; hashIntegridade: string; assinaturaServico: string; urlPdf: string | null; geradoEm: Date } | null,
  ) {
    return {
      id: validacao.id,
      atendimento_id: validacao.atendimentoId,
      status: validacao.status,
      metodo: validacao.metodo,
      criado_em: validacao.criadoEm.toISOString(),
      expira_em: validacao.expiraEm ? validacao.expiraEm.toISOString() : null,
      confirmado_em: validacao.confirmadoEm ? validacao.confirmadoEm.toISOString() : null,
      tentativas: validacao.tentativas,
      ...(metodosDisponiveis ? { metodos_disponiveis: metodosDisponiveis } : {}),
      ...(override?.mensagem ? { mensagem: override.mensagem } : {}),
      comprovante: comprovante
        ? {
            id: comprovante.id,
            hash_integridade: comprovante.hashIntegridade,
            assinatura_servico: comprovante.assinaturaServico,
            url_pdf: comprovante.urlPdf,
            gerado_em: comprovante.geradoEm.toISOString(),
          }
        : null,
    };
  }
}
