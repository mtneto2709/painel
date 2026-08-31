import { Module } from "@nestjs/common";
import { ComprovantesController } from "./comprovantes.controller";
import { ComprovantesService } from "./comprovantes.service";
import { ComprovantesProcessor } from "./comprovantes.processor";
import { PdfService } from "./pdf.service";

@Module({
  controllers: [ComprovantesController],
  providers: [ComprovantesService, ComprovantesProcessor, PdfService],
  exports: [ComprovantesService],
})
export class ComprovantesModule {}
