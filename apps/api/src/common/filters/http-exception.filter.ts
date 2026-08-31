import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

/**
 * Filtro global de excecoes: garante que toda resposta de erro siga o
 * envelope padrao `{ status, mensagem, detalhes }` com mensagens em pt-BR.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExcecaoNaoTratada");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "status" in body) {
        response.status(status).json(body);
        return;
      }
      const mensagem =
        typeof body === "string"
          ? body
          : (body as { message?: string | string[] }).message ?? exception.message;
      response.status(status).json({
        status: "erro_validacao",
        mensagem: Array.isArray(mensagem) ? mensagem.join("; ") : mensagem,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: "erro",
      mensagem: "Ocorreu um erro interno inesperado. Tente novamente em instantes.",
    });
  }
}
