# Prototype service (AWS Lambda)

Starter for a prototype service that runs as an **AWS Lambda** function behind the
shared, Cognito-authenticated ALB. Created by `prototype init <name> --runtime lambda`.

```
.
├── src/index.js          # your handler — ALB event in, { statusCode, body } out
├── package.json
├── scripts/deploy.sh     # zips + deploys the function and its ALB wiring
└── .github/workflows/
    └── build.yml         # OIDC → scripts/deploy.sh (no ECR, no container)
```

## How it deploys

Push to `main` and GitHub Actions:

1. Assumes the deploy IAM role via OIDC (no stored credentials).
2. Runs `scripts/deploy.sh`, which zips the function, creates/updates the Lambda,
   then ensures a **Lambda target group**, the ALB **invoke permission**, the
   **target registration**, and a **listener rule**
   (`host-header` → `authenticate-cognito` → forward).

The `authenticate-cognito` rule enforces login at the ALB, so the function is
never invoked for an unauthenticated request — the app code handles no auth.

Your service is live at `https://<name>.prototype.<your-domain>` shortly after
the push.

## When to pick Lambda

Best for event-driven, bursty, or low-frequency workloads (batch, automation,
webhooks) that benefit from scale-to-zero. For steady-traffic web/APIs, the
container runtimes (ECS / EKS) are usually a better fit.

## Customising

- **Handler** — `src/index.handler`. Add dependencies to `package.json`; the zip
  bundles `node_modules` if present.
- **Size / timeout** — `--memory-size` / `--timeout` in `scripts/deploy.sh`.
- **App AWS permissions** — attach policies to the shared execution role
  (`<name>-exec`) in the platform Terraform.
