# Prototype service (Lambda + Web Adapter)

Starter for a prototype **web/API** service that runs on **AWS Lambda** using the
[AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter),
behind the shared, Cognito-authenticated ALB. Created by
`prototype init <name> --runtime lambda-web`.

```
.
├── Dockerfile            # ECS/EKS app + LWA extension layer
├── src/index.js          # the SAME Express app as the container runtimes
├── package.json
├── scripts/deploy.sh     # ECR push is done by the workflow; this wires Lambda + ALB
└── .github/workflows/
    └── build.yml         # OIDC → ECR push → scripts/deploy.sh
```

## Why LWA

The application code is **identical to the ECS/EKS templates** — a normal Express
server on port 8080 with `/healthz`. The Lambda Web Adapter bridges the Lambda
Runtime API to that server, so you get serverless scale-to-zero for a web app
without rewriting it to a native Lambda handler.

- **`lambda-web`** (this) — web/API apps on Lambda, container image, shares app code with ECS/EKS.
- **`lambda`** — native handler, best for event-driven / batch (no HTTP server).

## How it deploys

Push to `main` and GitHub Actions builds the image, pushes it to ECR, then runs
`scripts/deploy.sh` to create/update the container-image function and ensure the
Lambda target group, invoke permission, and `authenticate-cognito` listener rule.

Live at `https://<name>.prototype.<your-domain>` shortly after the push.
