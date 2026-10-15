FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production API_PORT=3001 DATABASE_PATH=/app/data/roteiro.sqlite
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev && mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY --chmod=755 scripts/container-entrypoint.sh /usr/local/bin/roteiro-entrypoint
EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/roteiro-entrypoint"]
CMD ["npm","start"]
