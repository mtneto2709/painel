import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.module";

/**
 * Limitador de taxa simples baseado em Redis (janela fixa com INCR + TTL).
 * Usado para limitar tentativas de OTP e chamadas de API por tenant/paciente/IP.
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Incrementa o contador da chave e lanca 429 se o limite for excedido.
   * @param chave identificador unico do escopo (ex.: `otp:tenant:paciente`)
   * @param limite numero maximo de ocorrencias na janela
   * @param janelaSegundos duracao da janela em segundos
   */
  async consumirOuFalhar(chave: string, limite: number, janelaSegundos: number): Promise<void> {
    const chaveCompleta = `rate:${chave}`;
    const contagem = await this.redis.incr(chaveCompleta);
    if (contagem === 1) {
      await this.redis.expire(chaveCompleta, janelaSegundos);
    }
    if (contagem > limite) {
      throw new HttpException(
        {
          status: "erro_validacao",
          mensagem: "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async contagemAtual(chave: string): Promise<number> {
    const valor = await this.redis.get(`rate:${chave}`);
    return valor ? Number(valor) : 0;
  }
}
