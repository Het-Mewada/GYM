FROM node:22-alpine AS base
RUN npm install -g pnpm@12.18.0
WORKDIR /app

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @gym/shared run build
RUN pnpm --filter @gym/db run build
RUN pnpm --filter @gym/api run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./

EXPOSE 4000
CMD ["pnpm", "--filter", "@gym/api", "run", "start"]
