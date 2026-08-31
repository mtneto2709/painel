# Dockerfile do painel administrativo do tenant.
# Build de contexto = raiz do monorepo. Ver docker-compose.yml.

FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/admin-panel/package.json apps/admin-panel/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared-types packages/shared-types
COPY apps/admin-panel apps/admin-panel
RUN pnpm --filter @atendvalida/shared-types build

ARG VITE_API_BASE_URL=http://localhost:3000/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @atendvalida/admin-panel build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/admin-panel/dist /usr/share/nginx/html
COPY apps/admin-panel/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
