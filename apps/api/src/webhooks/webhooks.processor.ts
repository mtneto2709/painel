import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { FILA_WEBHOOKS } from "../queue/queue.constants";

/**
 * Worker de entrega de webhooks. O retry/backoff exponencial e controlado
 * pelas opcoes do job (ver WebhooksService.dispararEvento) — o BullMQ
 * reexecuta `process` automaticamente ate `attempts` vezes.
 */
@Processor(FILA_WEBHOOKS)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger("WebhooksProcessor");

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ webhookEventoId: string }>): Promise<void> {
    const evento = await this.prisma.webhookEvento.findUnique({
      where: { id: job.data.webhookEventoId },
      include: { tenant: { include: { webhookConfig: true } } },
    });
    if (!evento || !evento.tenant.webhookConfig) {
      this.logger.warn(`Evento de webhook ${job.data.webhookEventoId} sem configuracao ativa.`);
      return;
    }

    await this.prisma.webhookEvento.update({
      where: { id: evento.id },
      data: { tentativasReentrega: { increment: 1 } },
    });

    try {
      const resposta = await fetch(evento.tenant.webhookConfig.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          assinatura_webhook: evento.assinatura,
        },
        body: JSON.stringify(evento.payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!resposta.ok) {
        throw new Error(`Resposta HTTP ${resposta.status} do endpoint do tenant.`);
      }

      await this.prisma.webhookEvento.update({
        where: { id: evento.id },
        data: { statusEntrega: "entregue", enviadoEm: new Date() },
      });
      this.logger.log(`Webhook ${evento.evento} entregue para tenant ${evento.tenantId}.`);
    } catch (erro) {
      const ultimaTentativa = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.prisma.webhookEvento.update({
        where: { id: evento.id },
        data: { statusEntrega: ultimaTentativa ? "falhou" : "pendente" },
      });
      this.logger.warn(
        `Falha ao entregar webhook ${evento.id} (tentativa ${job.attemptsMade + 1}): ${
          (erro as Error).message
        }`,
      );
      throw erro;
    }
  }
}
