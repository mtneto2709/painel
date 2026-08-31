import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Protege rotas exigindo um JWT valido emitido por /v1/auth/token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
