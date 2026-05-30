# Prototype service (EKS)

Starter for a prototype service that runs on **Amazon EKS** behind the shared,
Cognito-authenticated ALB. Created by `prototype init <name>` (or
`prototype init <name> --runtime eks`).

```
.
├── Dockerfile            # same Express app as the other runtimes
├── src/index.js          # your app — listens on $PORT (8080), serves /healthz
├── package.json
└── helm/
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── deployment.yaml
        ├── service.yaml
        ├── ingress.yaml         # Cognito authenticate-cognito annotations pre-wired
        ├── networkpolicy.yaml   # default-deny + allow ALB
        └── pdb.yaml             # PodDisruptionBudget
```

## How it deploys

Push to `main` and GitHub Actions:

1. Assumes the deploy IAM role via OIDC (no stored credentials).
2. Builds the image and pushes it to ECR.
3. Runs `helm upgrade --install --atomic`, which:
   - Renders the Deployment + Service + Ingress.
   - The AWS Load Balancer Controller picks up the Ingress, registers it as a
     rule on the **shared ALB** (`group.name: prototype`), and attaches the
     **authenticate-cognito** action from the `values.yaml` annotations.
   - `--atomic` rolls back if any resource fails to become ready, so a broken
     deploy never leaves the service half-applied.

Authentication is enforced at the ALB by the `authenticate-cognito` listener
rule, so your application code never handles auth — same as the ECS, Lambda,
and Lambda + Web Adapter variants.

Your service is live at `https://<name>.prototype.<your-domain>` a few minutes
after the push.

## Customising

- **Port** — the container listens on `$PORT` (default 8080). Change it in
  `helm/values.yaml` (`service.targetPort`) and the `Dockerfile` `EXPOSE`
  together.
- **Replicas / size** — `replicaCount`, `resources` in `helm/values.yaml`. The
  PodDisruptionBudget caps voluntary disruption at 1 so a node drain never
  takes both replicas down at once.
- **App AWS permissions** — attach policies to the IAM role bound to the
  service account, declared in the EKS platform Terraform.

## Security defaults

The Helm chart ships with:

- Non-root user, read-only root filesystem.
- All Linux capabilities dropped (`securityContext.capabilities.drop: [ALL]`).
- `seccompProfile: RuntimeDefault`.
- Liveness + readiness probes hitting `/healthz`.
- Default-deny NetworkPolicy + an explicit allow rule from the ALB.

If you need to relax any of these, do it deliberately in `values.yaml` rather
than removing the field from the template.
