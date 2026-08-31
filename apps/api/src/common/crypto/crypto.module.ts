import { Global, Module } from "@nestjs/common";
import { KMS_PROVIDER } from "./kms.provider.interface";
import { LocalKmsProvider } from "./local-kms.provider";
import { SignatureService } from "./signature.service";
import { MaskService } from "./mask.service";

@Global()
@Module({
  providers: [
    { provide: KMS_PROVIDER, useClass: LocalKmsProvider },
    SignatureService,
    MaskService,
  ],
  exports: [KMS_PROVIDER, SignatureService, MaskService],
})
export class CryptoModule {}
