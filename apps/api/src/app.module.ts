import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { AuditoriaModule } from "./common/audit/auditoria.module";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";
import { QueueModule } from "./queue/queue.module";
import { AuthModule } from "./auth/auth.module";
import { TenantsModule } from "./tenants/tenants.module";
import { PacientesModule } from "./pacientes/pacientes.module";
import { ConsentimentosModule } from "./consentimentos/consentimentos.module";
import { ValidacoesModule } from "./validacoes/validacoes.module";
import { ComprovantesModule } from "./comprovantes/comprovantes.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : { target: "pino-pretty", options: { singleLine: true } },
        redact: {
          // Nunca logamos dados sensiveis em claro (LGPD).
          paths: [
            "req.headers.authorization",
            "req.headers['x-operator-token']",
            'req.body.paciente.telefone',
            'req.body.paciente.cpf_hash',
            'req.body.api_secret',
            'req.body.codigo_informado',
            'req.body.imagem_base64',
          ],
          censor: "***",
        },
      },
    }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditoriaModule,
    RateLimitModule,
    QueueModule,
    AuthModule,
    TenantsModule,
    PacientesModule,
    ConsentimentosModule,
    ValidacoesModule,
    ComprovantesModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
