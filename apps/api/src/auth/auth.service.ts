import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { verificarHashSegredo } from "../common/crypto/secret-hash.util";
import { AuditoriaService } from "../common/audit/auditoria.service";

export interface JwtPayload {
  sub: string; // tenantId
  apiKeyId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Troca api_key_id + api_secret por um JWT de curta duracao (client credentials). */
  async autenticar(apiKeyId: string, apiSecret: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { apiKeyId } });
    if (!tenant || !verificarHashSegredo(apiSecret, tenant.apiKeyHash)) {
      throw new UnauthorizedException({
        status: "nao_autorizado",
        mensagem: "Credenciais invalidas (api_key_id/api_secret).",
      });
    }
    if (tenant.status !== "ativo") {
      throw new UnauthorizedException({
        status: "nao_autorizado",
        mensagem: "Tenant inativo ou suspenso. Contate o suporte do AtendValida.",
      });
    }

    const payload: JwtPayload = { sub: tenant.id, apiKeyId: tenant.apiKeyId };
    const accessToken = await this.jwt.signAsync(payload);

    await this.auditoria.registrar({
      tenantId: tenant.id,
      ator: `tenant:${tenant.id}`,
      acao: "auth.token_emitido",
      entidade: "tenant",
      entidadeId: tenant.id,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 900),
    };
  }
}
