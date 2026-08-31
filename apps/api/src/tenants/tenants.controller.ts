import { Body, Controller, Get, Param, ParseEnumPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { MetodoValidacao } from "@atendvalida/shared-types";
import { TenantsService } from "./tenants.service";
import { CriarTenantDto } from "./dto/criar-tenant.dto";
import { ConfigurarMetodoDto } from "./dto/configurar-metodo.dto";
import { OperatorGuard } from "../common/guards/operator.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TenantMatchGuard } from "../common/guards/tenant-match.guard";

@ApiTags("tenants")
@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @UseGuards(OperatorGuard)
  @ApiOperation({ summary: "Cria um novo tenant (uso interno do operador do AtendValida)" })
  async criar(@Body() dto: CriarTenantDto) {
    return this.tenantsService.criar(dto);
  }

  @Get(":id/metodos")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @ApiOperation({ summary: "Lista os metodos de validacao configurados para o tenant" })
  async listarMetodos(@Param("id") id: string) {
    return this.tenantsService.listarMetodos(id);
  }

  @Put(":id/metodos/:metodo")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @ApiOperation({ summary: "Ativa/configura um metodo de validacao para o tenant" })
  async configurarMetodo(
    @Param("id") id: string,
    @Param("metodo", new ParseEnumPipe(MetodoValidacao)) metodo: MetodoValidacao,
    @Body() dto: ConfigurarMetodoDto,
  ) {
    return this.tenantsService.configurarMetodo(id, metodo, dto);
  }

  @Post(":id/rotate-api-key")
  @UseGuards(OperatorGuard)
  @ApiOperation({ summary: "Rotaciona o api_secret do tenant (uso interno do operador)" })
  async rotacionarApiKey(@Param("id") id: string) {
    return this.tenantsService.rotacionarApiKey(id);
  }
}
