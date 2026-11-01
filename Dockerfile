# Imagem do alvo local: servidor Bun (Nitro) + SQLite em volume.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts: o script `prepare` instala hooks do lefthook (inútil na imagem).
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build:local

FROM oven/bun:1.4 AS runtime
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
CMD ["bun", "server/index.mjs"]
