import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "*").split(","),
    credentials: true,
  });

  app.setGlobalPrefix("v1", {
    exclude: ["/health", "/docs", "/docs-json"],
  });

  const config = new DocumentBuilder()
    .setTitle("AtendValida API")
    .setDescription(
      "Microservico multi-tenant para validacao/comprovacao de atendimentos de saude " +
        "via token (WhatsApp/SMS), assinatura em tela ou biometria facial.",
    )
    .setVersion("1.0.0")
    .addBearerAuth()
    .addTag("autenticacao", "Troca de API key/secret por JWT de curta duracao")
    .addTag("tenants", "Cadastro e configuracao de tenants (SaaS clientes)")
    .addTag("validacoes", "Criacao e acompanhamento de validacoes de atendimento")
    .addTag("comprovantes", "Consulta e verificacao de comprovantes assinados")
    .addTag("webhooks", "Configuracao e teste de webhooks do tenant")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, "0.0.0.0");
}

bootstrap();
