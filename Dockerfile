# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app

FROM base AS build

# Copy package metadata first so dependency installation remains cacheable.
COPY pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY claims-api/package.json ./claims-api/package.json
COPY claims-status-api/package.json ./claims-status-api/package.json
COPY scheduling-api/package.json ./scheduling-api/package.json
COPY web/package.json ./web/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY claims-api ./claims-api
COPY fixtures ./fixtures
COPY web ./web

RUN pnpm --dir claims-api build \
    && pnpm --dir web build \
    && pnpm --filter @pulsedesk/claims-api deploy --legacy --prod /prod/claims-api

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4310 \
    WEB_DIST_DIR=/app/web-dist

WORKDIR /app

COPY --from=build --chown=node:node /prod/claims-api ./claims-api
COPY --from=build --chown=node:node /app/fixtures ./fixtures
COPY --from=build --chown=node:node /app/web/dist ./web-dist

USER node
EXPOSE 4310

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4310/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "claims-api/dist/server.js"]
