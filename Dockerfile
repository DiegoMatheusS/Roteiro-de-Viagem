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
RUN npm ci --omit=dev && mkdir -p /app/data && chown -R node:node /app/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
USER node
EXPOSE 3001
CMD ["npm","start"]
