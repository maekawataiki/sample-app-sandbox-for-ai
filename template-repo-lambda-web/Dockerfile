# Same Express app as the ECS/EKS templates, made to run on Lambda via the AWS
# Lambda Web Adapter. The adapter (a Lambda extension) bridges the Lambda Runtime
# API to the plain HTTP server below — so the application code is identical across
# every runtime; only the packaging differs.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
# Lambda Web Adapter — pin the digest when refreshing the version.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /app
ENV NODE_ENV=production
# LWA forwards the Lambda event to the app on this port and uses /healthz to
# decide readiness — the same port and path the app already uses on ECS/EKS.
ENV PORT=8080
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/healthz
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY cedar/ ./cedar/
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
