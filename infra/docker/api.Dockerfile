# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run db:generate && npm run build -w @marketpilot/api

# One-shot migrations use the development CLI; it is excluded from the API runtime.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "db:migrate"]

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node infra/runtime/launch.mjs ./infra/runtime/launch.mjs
USER node
EXPOSE 4000
ENTRYPOINT ["node", "infra/runtime/launch.mjs", "api"]
CMD ["node", "apps/api/dist/index.mjs"]
