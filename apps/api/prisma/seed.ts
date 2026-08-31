/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
import { gerarHashSegredo, gerarParApiKey } from "../src/common/crypto/secret-hash.util";
import { LocalKmsProvider } from "../src/common/crypto/local-kms.provider";

config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const kms = new LocalKmsProvider();

  const { apiKeyId, apiSecret } = gerarParApiKey();
  const apiKeyHash = gerarHashSegredo(apiSecret);

  const tenant = await prisma.tenant.upsert({
    where: { apiKeyId },
    update: {},
    create: {
      nome: "Clínica ABC (demo)",
      emailContato: "contato@clinicaabc.com.br",
      apiKeyId,
      apiKeyHash,
      metodos: {
        create: [
          { metodo: "token_whatsapp", ativo: true, configurado: true, configuracao: { remetente: "+5585999990000" } },
          { metodo: "token_sms", ativo: false, configurado: false, configuracao: {} },
          { metodo: "assinatura_tela", ativo: false, configurado: false, configuracao: {} },
          { metodo: "biometria_facial", ativo: false, configurado: false, configuracao: {} },
        ],
      },
    },
  });

  const telefone = "+5585999887766";
  const paciente = await prisma.paciente.upsert({
    where: { tenantId_idExterno: { tenantId: tenant.id, idExterno: "pac_45210" } },
    update: {},
    create: {
      tenantId: tenant.id,
      idExterno: "pac_45210",
      nome: "Maria da Silva Souza",
      telefoneCriptografado: await kms.encrypt(telefone),
      telefoneMascarado: "****7766",
      cpfHash: "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3",
    },
  });

  console.log("\n=== Seed concluído ===");
  console.log(`Tenant demo: ${tenant.nome} (${tenant.id})`);
  console.log(`  api_key_id: ${apiKeyId}`);
  console.log(`  api_secret: ${apiSecret}  <-- guarde agora, não será mostrado novamente`);
  console.log(`Paciente demo: ${paciente.nome} (id_externo=${paciente.idExterno})`);
  console.log("Procedimento sugerido para testes: \"Consulta - Clínica Geral\"\n");
}

main()
  .catch((erro) => {
    console.error("Falha ao executar o seed:", erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
