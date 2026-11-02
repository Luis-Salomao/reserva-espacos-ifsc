# Imagem do alvo local: servidor Bun (Nitro) + SQLite em volume.
FROM oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts: o script `prepare` instala hooks do lefthook (inútil na imagem).
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build:local
# CLI enxuta de criação do primeiro administrador (só banco local, hasher, repositórios e migrações).
RUN bun build cli/image-entry.ts --target bun --outfile .output/cli.mjs

FROM oven/bun:1.4.2 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DEPLOY_TARGET=local \
    DATABASE_PATH=/data/app.sqlite \
    MIGRATIONS_DIR=/app/drizzle \
    PORT=3000
COPY --from=build /app/.output ./
RUN mkdir -p /data && chown -R bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/health`); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "server/index.mjs"]
