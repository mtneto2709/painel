import { Module } from "@nestjs/common";
import { ConsentimentosService } from "./consentimentos.service";

@Module({
  providers: [ConsentimentosService],
  exports: [ConsentimentosService],
})
export class ConsentimentosModule {}
