# Base image pinned to digest so a rebuild on a future date produces the same
# image. Update via `docker pull node:20-alpine && docker inspect ...` when
# refreshing.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
