FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/saas-server/package.json apps/saas-server/package.json
COPY apps/saas-web/package.json apps/saas-web/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/device-protocol/package.json packages/device-protocol/package.json
COPY packages/platform-steam/package.json packages/platform-steam/package.json
COPY packages/renderer/package.json packages/renderer/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate --schema apps/saas-server/prisma/schema.prisma
RUN npm run build --workspace @digital-shelf-saas/shared-types
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/saas-server ./apps/saas-server
COPY --from=build /app/packages ./packages

EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/saas-server/prisma/schema.prisma && npm run start --workspace @digital-shelf-saas/server"]
