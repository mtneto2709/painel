import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ValidacoesService, ContextoRequisicao } from "./validacoes.service";
import { CriarValidacaoDto } from "./dto/criar-validacao.dto";
import { ConfirmarTokenDto } from "./dto/confirmar-token.dto";
import { EnviarAssinaturaDto } from "./dto/enviar-assinatura.dto";
import { EnviarBiometriaDto } from "./dto/enviar-biometria.dto";
import { ListarValidacoesQueryDto } from "./dto/listar-validacoes.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentTenant, TenantAutenticado } from "../auth/current-tenant.decorator";
import { ConsentimentosService } from "../consentimentos/consentimentos.service";
import { RegistrarConsentimentoDto } from "../consentimentos/dto/registrar-consentimento.dto";

@ApiTags("validacoes")
@Controller("validacoes")
export class ValidacoesController {
  constructor(
    private readonly validacoesService: ValidacoesService,
    private readonly consentimentosService: ConsentimentosService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Cria uma nova validação de atendimento" })
  async criar(
    @Body() dto: CriarValidacaoDto,
    @CurrentTenant() tenant: TenantAutenticado,
    @Req() req: Request,
  ) {
    return this.validacoesService.criar(tenant.tenantId, dto, this.extrairContexto(req));
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Lista o histórico de validações do tenant autenticado, com filtros e paginação",
  })
  async listar(@Query() query: ListarValidacoesQueryDto, @CurrentTenant() tenant: TenantAutenticado) {
    return this.validacoesService.listarPorTenant(
      tenant.tenantId,
      {
        status: query.status,
        metodo: query.metodo,
        dataInicio: query.data_inicio ? new Date(query.data_inicio) : undefined,
        dataFim: query.data_fim ? new Date(query.data_fim) : undefined,
      },
      query.pagina ?? 1,
      query.tamanho_pagina ?? 20,
    );
  }

  @Get(":id")
  @ApiOperation({
    summary:
      "Consulta o status de uma validação (acessível por posse do id — usado pelo app de captura)",
  })
  async obter(@Param("id") id: string) {
    return this.validacoesService.obter(id);
  }

  @Post(":id/token/confirmar")
  @ApiOperation({ summary: "Confirma o código OTP informado pelo paciente" })
  async confirmarToken(@Param("id") id: string, @Body() dto: ConfirmarTokenDto, @Req() req: Request) {
    return this.validacoesService.confirmarToken(id, dto.codigo_informado, this.extrairContexto(req));
  }

  @Post(":id/reenviar")
  @ApiOperation({ summary: "Expira o código atual e envia um novo (rate limited)" })
  async reenviar(@Param("id") id: string, @Req() req: Request) {
    return this.validacoesService.reenviar(id, this.extrairContexto(req));
  }

  @Post(":id/assinatura")
  @ApiOperation({
    summary: "Envia a assinatura em tela capturada (método stubado: retorna metodo_nao_configurado)",
  })
  async enviarAssinatura(@Param("id") id: string, @Body() dto: EnviarAssinaturaDto, @Req() req: Request) {
    return this.validacoesService.enviarAssinatura(id, dto, this.extrairContexto(req));
  }

  @Post(":id/biometria")
  @ApiOperation({
    summary: "Envia a captura facial para verificação (método stubado: retorna metodo_nao_configurado)",
  })
  async enviarBiometria(@Param("id") id: string, @Body() dto: EnviarBiometriaDto, @Req() req: Request) {
    return this.validacoesService.enviarBiometria(id, dto, this.extrairContexto(req));
  }

  @Post(":id/consentimento")
  @ApiOperation({
    summary: "Registra o consentimento LGPD do paciente (obrigatório antes da biometria facial)",
  })
  async registrarConsentimento(
    @Param("id") id: string,
    @Body() dto: RegistrarConsentimentoDto,
    @Req() req: Request,
  ) {
    const { tenantId, pacienteId } = await this.validacoesService.obterTenantEPaciente(id);
    const consentimento = await this.consentimentosService.registrar(
      tenantId,
      pacienteId,
      dto,
      req.ip,
      req.headers["user-agent"],
    );
    return { registrado: Boolean(consentimento), consentimento_id: consentimento?.id ?? null };
  }

  private extrairContexto(req: Request): ContextoRequisicao {
    return { ip: req.ip, userAgent: req.headers["user-agent"] };
  }
}
