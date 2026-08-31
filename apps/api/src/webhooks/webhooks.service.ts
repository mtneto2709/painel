import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { createHash, createHmac, randomBytes } from "crypto";
import { EventoWebhook } from "@atendvalida/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { KMS_PROVIDER, KmsProvider } from "../common/crypto/kms.provider.interface";
import { AuditoriaService } from "../common/audit/auditoria.service";
import { FILA_WEBHOOKS } from "../queue/queue.constants";
import { ConfigurarWebhookDto } from "./dto/configurar-webhook.dto";

const TENTATIVAS_MAX = 5;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(KMS_PROVIDER) private readonly kms: KmsProvider,
    private readonly auditoria: AuditoriaService,
    @InjectQueue(FILA_WEBHOOKS) private readonly filaWebhooks: Queue,
  ) {}

  async configurar(tenantId: string, dto: ConfigurarWebhookDto) {
    const segredo = dto.segredo ?? randomBytes(24).toString("hex");
    const segredoCriptografado = await this.kms.encrypt(segredo);
    const segredoHash = createHash("sha256").update(segredo).digest("hex");

    const config = await this.prisma.webhookConfiguracao.upsert({
      where: { tenantId },
      create: { tenantId, url: dto.url, ativo: dto.ativo, segredoHash, segredoCriptografado },
      update: { url: dto.url, ativo: dto.ativo, segredoHash, segredoCriptografado },
    });

    await this.auditoria.registrar({
      tenantId,
      ator: `tenant:${tenantId}`,
      acao: "webhook.configurado",
      entidade: "webhook_configuracao",
      entidadeId: config.id,
      detalhes: { url: dto.url, ativo: dto.ativo },
    });

    return {
      url: config.url,
      ativo: config.ativo,
      // O segredo em claro so e retornado na configuracao/rotacao, nunca depois.
      segredo: dto.segredo ? undefined : segredo,
      atualizado_em: config.atualizadoEm,
    };
  }

  async obterConfig(tenantId: string) {
    const config = await this.prisma.webhookConfiguracao.findUnique({ where: { tenantId } });
    if (!config) return null;
    return { url: config.url, ativo: config.ativo, atualizado_em: config.atualizadoEm };
  }

  /** Enfileira um evento assinado para entrega (usado internamente pelo fluxo de validacoes). */
  async dispararEvento(
    tenantId: string,
    evento: EventoWebhook | "webhook.teste",
    validacaoId: string | null,
    dados: Record<string, unknown>,
  ) {
    const config = await this.prisma.webhookConfiguracao.findUnique({ where: { tenantId } });
    if (!config || !config.ativo) return null;

    const payload = {
      evento,
      tenant_id: tenantId,
      validacao_id: validacaoId,
      emitido_em: new Date().toISOString(),
      dados,
    };
    const segredo = await this.kms.decrypt(config.segredoCriptografado);
    const assinatura = createHmac("sha256", segredo).update(JSON.stringify(payload)).digest("hex");

    const registro = await this.prisma.webhookEvento.create({
      data: {
        tenantId,
        validacaoId: validacaoId ?? undefined,
        evento,
        payload: payload as any,
        assinatura,
      },
    });

    await this.filaWebhooks.add(
      "entregar",
      { webhookEventoId: registro.id },
      { attempts: TENTATIVAS_MAX, backoff: { type: "exponential", delay: 5000 } },
    );

    return registro;
  }

  async testar(tenantId: string) {
    const config = await this.prisma.webhookConfiguracao.findUnique({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException({
        status: "nao_encontrado",
        mensagem: "Configure um webhook antes de testar.",
      });
    }
    return this.dispararEvento(tenantId, "webhook.teste", null, {
      mensagem: "Este é um evento de teste disparado pelo painel do AtendValida.",
    });
  }
}
