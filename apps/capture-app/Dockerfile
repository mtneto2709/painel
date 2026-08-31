# Dockerfile do app de captura (paciente).
# Build de contexto = raiz do monorepo. Ver docker-compose.yml.

FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/capture-app/package.json apps/capture-app/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared-types packages/shared-types
COPY apps/capture-app apps/capture-app
RUN pnpm --filter @atendvalida/shared-types build

ARG VITE_API_BASE_URL=http://localhost:3000/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @atendvalida/capture-app build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/capture-app/dist /usr/share/nginx/html
COPY apps/capture-app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
