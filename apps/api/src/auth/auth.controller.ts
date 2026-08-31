import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

@ApiTags("autenticacao")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("token")
  @HttpCode(200)
  @ApiOperation({
    summary: "Troca api_key_id + api_secret do tenant por um JWT de curta duracao",
  })
  async token(@Body() dto: LoginDto) {
    return this.authService.autenticar(dto.api_key_id, dto.api_secret);
  }
}
