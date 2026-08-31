import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

/**
 * Protege endpoints de uso interno do operador do AtendValida (ex.: criacao
 * de tenants) exigindo um token estatico via header `X-Operator-Token`.
 * Em producao, este token deve ser rotacionado e restrito a rede interna.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers["x-operator-token"];
    const esperado = process.env.OPERATOR_TOKEN;
    if (!esperado || token !== esperado) {
      throw new UnauthorizedException({
        status: "nao_autorizado",
        mensagem: "Token de operador ausente ou invalido.",
      });
    }
    return true;
  }
}
