# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w @marketpilot/worker && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production WORKER_HEALTH_PORT=4001
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --chown=node:node infra/runtime/launch.mjs ./infra/runtime/launch.mjs
USER node
EXPOSE 4001
ENTRYPOINT ["node", "infra/runtime/launch.mjs", "worker"]
CMD ["node", "apps/worker/dist/index.mjs"]
