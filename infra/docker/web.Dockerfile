# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm ci
# Next rewrites are compiled at build time. This is a private service URL, never a secret.
ARG API_INTERNAL_URL=http://marketpilot-api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN npm run build -w @marketpilot/web

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --chown=node:node infra/runtime/launch.mjs ./infra/runtime/launch.mjs
USER node
EXPOSE 3000
ENTRYPOINT ["node", "infra/runtime/launch.mjs", "web"]
CMD ["node", "apps/web/server.js"]
