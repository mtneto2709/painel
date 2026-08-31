import { Module } from "@nestjs/common";
import { PacientesService } from "./pacientes.service";

@Module({
  providers: [PacientesService],
  exports: [PacientesService],
})
export class PacientesModule {}
