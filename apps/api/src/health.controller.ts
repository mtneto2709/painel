import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

@ApiExcludeController()
@Controller("health")
export class HealthController {
  @Get()
  status() {
    return { status: "ok", servico: "atendvalida-api" };
  }
}
