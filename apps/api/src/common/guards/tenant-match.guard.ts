import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Garante que o tenant autenticado via JWT so acesse/edite recursos do
 * proprio tenant (parametro de rota `:id` deve ser igual ao `tenantId` do token).
 */
@Injectable()
export class TenantMatchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantIdDoToken = request.user?.tenantId;
    const tenantIdDaRota = request.params?.id;
    if (!tenantIdDoToken || tenantIdDoToken !== tenantIdDaRota) {
      throw new ForbiddenException({
        status: "nao_autorizado",
        mensagem: "Voce nao tem permissao para acessar recursos de outro tenant.",
      });
    }
    return true;
  }
}
