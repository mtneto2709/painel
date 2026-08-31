import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface TenantAutenticado {
  tenantId: string;
  apiKeyId: string;
}

/** Extrai o tenant autenticado (via JwtAuthGuard) do request. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantAutenticado => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
