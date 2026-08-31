# Dockerfile da API AtendValida.
# Build de contexto = raiz do monorepo (necessário para resolver o workspace
# @atendvalida/shared-types via pnpm). Ver docker-compose.yml.

FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

RUN pnpm --filter @atendvalida/shared-types build
RUN pnpm --filter @atendvalida/api exec prisma generate
RUN pnpm --filter @atendvalida/api build

FROM node:20-alpine AS runtime
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma

# Gera o client do Prisma já dentro da imagem de runtime (evita depender do
# layout interno de node_modules gerado no estágio de build).
RUN pnpm --filter @atendvalida/api exec prisma generate

WORKDIR /repo/apps/api
EXPOSE 3000

# Aplica migrations pendentes e sobe a API. Em produção, prefira rodar as
# migrations como um passo de deploy separado (job/init container).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
