# Self-hosted build: Node 24 provides the built-in SQLite driver (node:sqlite).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    BODY_SIZE_LIMIT=64M
COPY --from=build /app/package.json ./
COPY --from=build /app/build ./build
# /data holds the SQLite database; mount a volume to keep accounts and plans.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "build/index.js"]
