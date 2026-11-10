# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm config set registry ${NPM_REGISTRY} && npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# 运行期迁移用的 prisma CLI，单独安装以带齐其依赖
FROM ${NODE_IMAGE} AS tools
WORKDIR /tools
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm config set registry ${NPM_REGISTRY} && npm init -y >/dev/null && npm install --no-audit --no-fund --omit=dev prisma@6.19.3

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app && useradd -r -g app -d /app app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Asia/Shanghai STORAGE_ROOT=/data/storage
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
# 种子所需（standalone 不追踪 seed.mjs 的依赖）
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=tools /tools/node_modules /opt/prisma-cli/node_modules
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data/storage && chown -R app:app /data /app /opt/prisma-cli
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
