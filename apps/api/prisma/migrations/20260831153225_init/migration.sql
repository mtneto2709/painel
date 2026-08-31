-- CreateEnum
CREATE TYPE "StatusTenant" AS ENUM ('ativo', 'suspenso', 'inativo');

-- CreateEnum
CREATE TYPE "MetodoValidacao" AS ENUM ('token_whatsapp', 'token_sms', 'assinatura_tela', 'biometria_facial');

-- CreateEnum
CREATE TYPE "StatusValidacao" AS ENUM ('aguardando', 'confirmado', 'expirado', 'codigo_invalido', 'rejeitado', 'erro', 'metodo_nao_configurado');

-- CreateEnum
CREATE TYPE "StatusEntregaWebhook" AS ENUM ('pendente', 'entregue', 'falhou');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email_contato" TEXT,
    "api_key_id" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "status" "StatusTenant" NOT NULL DEFAULT 'ativo',
    "configuracoes_gerais" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_validation_methods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "metodo" "MetodoValidacao" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "configuracao" JSONB NOT NULL DEFAULT '{}',
    "configurado" BOOLEAN NOT NULL DEFAULT false,
    "procedimento_tipo" TEXT NOT NULL DEFAULT '',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_validation_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "id_externo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone_criptografado" TEXT NOT NULL,
    "telefone_mascarado" TEXT NOT NULL,
    "cpf_hash" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "atendimento_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "metodo" "MetodoValidacao" NOT NULL,
    "status" "StatusValidacao" NOT NULL DEFAULT 'aguardando',
    "codigo_hash" TEXT,
    "contexto" JSONB NOT NULL DEFAULT '{}',
    "documento_referencia_hash" TEXT,
    "metadata_captura" JSONB NOT NULL DEFAULT '{}',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmado_em" TIMESTAMP(3),
    "expira_em" TIMESTAMP(3),

    CONSTRAINT "validacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprovantes" (
    "id" TEXT NOT NULL,
    "validacao_id" TEXT NOT NULL,
    "hash_integridade" TEXT NOT NULL,
    "assinatura_servico" TEXT NOT NULL,
    "payload_auditavel" JSONB NOT NULL,
    "url_pdf" TEXT,
    "gerado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprovantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimentos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "versao_termo" TEXT NOT NULL,
    "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "evidencia" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "consentimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_configuracoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "segredo_hash" TEXT NOT NULL,
    "segredo_criptografado" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_eventos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "validacao_id" TEXT,
    "evento" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "assinatura" TEXT NOT NULL,
    "status_entrega" "StatusEntregaWebhook" NOT NULL DEFAULT 'pendente',
    "tentativas_reentrega" INTEGER NOT NULL DEFAULT 0,
    "enviado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_log" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "ator" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidade_id" TEXT,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "hash_anterior" TEXT,
    "hash_atual" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_api_key_id_key" ON "tenants"("api_key_id");

-- CreateIndex
CREATE INDEX "tenant_validation_methods_tenant_id_idx" ON "tenant_validation_methods"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_validation_methods_tenant_id_metodo_procedimento_tip_key" ON "tenant_validation_methods"("tenant_id", "metodo", "procedimento_tipo");

-- CreateIndex
CREATE INDEX "pacientes_tenant_id_idx" ON "pacientes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_tenant_id_id_externo_key" ON "pacientes"("tenant_id", "id_externo");

-- CreateIndex
CREATE INDEX "validacoes_tenant_id_status_idx" ON "validacoes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "validacoes_tenant_id_atendimento_id_idx" ON "validacoes"("tenant_id", "atendimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprovantes_validacao_id_key" ON "comprovantes"("validacao_id");

-- CreateIndex
CREATE INDEX "consentimentos_tenant_id_paciente_id_tipo_idx" ON "consentimentos"("tenant_id", "paciente_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_configuracoes_tenant_id_key" ON "webhook_configuracoes"("tenant_id");

-- CreateIndex
CREATE INDEX "webhook_eventos_tenant_id_status_entrega_idx" ON "webhook_eventos"("tenant_id", "status_entrega");

-- CreateIndex
CREATE INDEX "auditoria_log_tenant_id_criado_em_idx" ON "auditoria_log"("tenant_id", "criado_em");

-- AddForeignKey
ALTER TABLE "tenant_validation_methods" ADD CONSTRAINT "tenant_validation_methods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validacoes" ADD CONSTRAINT "validacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validacoes" ADD CONSTRAINT "validacoes_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprovantes" ADD CONSTRAINT "comprovantes_validacao_id_fkey" FOREIGN KEY ("validacao_id") REFERENCES "validacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimentos" ADD CONSTRAINT "consentimentos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimentos" ADD CONSTRAINT "consentimentos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_configuracoes" ADD CONSTRAINT "webhook_configuracoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_eventos" ADD CONSTRAINT "webhook_eventos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_eventos" ADD CONSTRAINT "webhook_eventos_validacao_id_fkey" FOREIGN KEY ("validacao_id") REFERENCES "validacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_log" ADD CONSTRAINT "auditoria_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
