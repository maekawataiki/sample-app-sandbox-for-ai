# Prototype service (ECS on Fargate)

Starter for a prototype service that runs on **Amazon ECS (Fargate)** behind the
shared, Cognito-authenticated ALB. Created by `prototype init <name> --runtime ecs`.

```
.
├── Dockerfile            # same Express app as the other runtimes
├── src/index.js          # your app — listens on $PORT (8080), serves /healthz
├── package.json
├── scripts/deploy.sh     # builds the ECS task def + ALB wiring (idempotent)
└── .github/workflows/
    └── build.yml         # OIDC → ECR push → scripts/deploy.sh
```

## How it deploys

Push to `main` and GitHub Actions:

1. Assumes the deploy IAM role via OIDC (no stored credentials).
2. Builds the image and pushes it to ECR.
3. Runs `scripts/deploy.sh`, which discovers the shared ALB / subnets / security
   group by tag, then ensures a **target group**, a **listener rule**
   (`host-header` → `authenticate-cognito` → forward), and the **ECS service** —
   registering a fresh task definition and rolling the service each time.

Authentication is enforced at the ALB by the `authenticate-cognito` listener
rule, so your application code never handles auth — same as the EKS variant
(which configures the equivalent via Helm Ingress annotations).

Your app is live at `https://<name>.prototype.<your-domain>` a few minutes after
the push.

## Customising

- **Port** — the container listens on `$PORT` (default 8080). Change
  `CONTAINER_PORT` in `scripts/deploy.sh` and the platform `container_port` var
  together if you need a different port.
- **Size / replicas** — `TASK_CPU`, `TASK_MEMORY`, `DESIRED_COUNT` in
  `scripts/deploy.sh`.
- **App AWS permissions** — attach policies to the shared task role
  (`<cluster>-task`) in the platform Terraform.
