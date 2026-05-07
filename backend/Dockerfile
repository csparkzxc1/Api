FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY shared-types/package.json shared-types/
RUN pnpm install --frozen-lockfile=false

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app /app
COPY shared-types ./shared-types
COPY backend ./backend
COPY openapi.yaml ./openapi.yaml
RUN pnpm --filter @cap-app/backend build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/shared-types ./shared-types
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/migrations ./backend/migrations
COPY --from=build /app/openapi.yaml ./openapi.yaml
RUN pnpm install --prod --frozen-lockfile=false
WORKDIR /app/backend
EXPOSE 8080
CMD ["node", "dist/server.js"]
