import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { FILA_COMPROVANTES, FILA_NOTIFICACOES, FILA_WEBHOOKS } from "./queue.constants";

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
      }),
    }),
    BullModule.registerQueue(
      { name: FILA_NOTIFICACOES },
      { name: FILA_WEBHOOKS },
      { name: FILA_COMPROVANTES },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
