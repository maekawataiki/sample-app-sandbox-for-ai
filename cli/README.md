# prototype CLI

`prototype` is the command-line tool for the platform documented in the
[root README](../README.md). It provisions new prototype services, lists the
runtimes an admin enabled, authenticates the operator against Cognito (or
Okta), and tears services down again.

## Install

```bash
npm install
npm run build
npm link              # exposes the `prototype` binary on $PATH
```

`npm link` is the dev workflow. To ship the CLI to other engineers without a
shared registry, publish a tarball:

```bash
npm pack              # emits @your-org-prototype-cli-<version>.tgz
# share the tarball, then on the consumer's machine:
npm install -g ./@your-org-prototype-cli-<version>.tgz
```

Requirements:

- Node.js ≥ 20
- AWS credentials available (default profile, env vars, or `aws sso login`) —
  used for ECR / Cognito / ECS / Lambda calls.
- GitHub auth — either `gh auth login`, or `GITHUB_TOKEN` set to a token with
  the `administration` scope (needed to create/delete service repos and set
  Actions variables).
- `helm` and `kubectl` on `$PATH` — EKS runtime only; needed by
  `prototype destroy` to remove the in-cluster release.

## Commands

| Command | Purpose |
|---|---|
| `prototype login` | Authenticate against the configured identity provider (Cognito OAuth2 PKCE in a browser; Okta device-code flow). Saves credentials to `~/.config/prototype/credentials.json` (mode 0600). |
| `prototype whoami` | Show the currently authenticated user. Refreshes the token if needed. Exits non-zero when no valid credentials are found. |
| `prototype runtimes` | List the compute runtimes the admin enabled on this platform, mark the default, and show the template repo + cluster/ECR shape of each. |
| `prototype init <name> [--runtime <rt>]` | Provision a service: GitHub repo from the template, ECR repository (container runtimes), Cognito callback URL, 10 Actions variables. Rolls back completed steps on failure. |
| `prototype destroy <name> [--yes] [--keep-repo]` | Tear a service down: runtime-specific compute removal (Helm uninstall / ECS service + ALB rule / Lambda function + ALB rule), Cognito callback URL, ECR repository, GitHub repo. |

### Flags

| Flag | Command | Effect |
|---|---|---|
| `-r, --runtime <rt>` | `init` | Pick `eks` / `ecs` / `lambda` / `lambda-web`. Defaults to `config.defaultRuntime`. |
| `-y, --yes` | `destroy` | Skip the confirmation prompt. |
| `--keep-repo` | `destroy` | Leave the GitHub repository in place; tear down only the AWS-side resources. |

## Configuration

The CLI reads `~/.config/prototype/config.json`. Every field also has an
environment-variable override that takes precedence if set.

### Full schema

```jsonc
{
  // Identity provider for the CLI login flow.
  "authProvider":       "cognito",            // or "okta"

  // Cognito-specific (when authProvider = "cognito"):
  "authClientId":       "<cognito_cli_client_id>",
  "cognitoDomain":      "<user_pool_domain>.auth.<region>.amazoncognito.com",
  "callbackPort":        8765,                // localhost port the PKCE callback listens on

  // Okta-specific (when authProvider = "okta"):
  // "authIssuer":      "https://<your-okta-domain>/oauth2/default",
  // "authClientId":    "<okta_client_id>",

  // Platform identity — used by `init` / `destroy`:
  "awsRegion":          "ap-northeast-1",
  "awsAccountId":       "<account_id>",
  "baseDomain":         "prototype.<your-domain>",
  "githubOrg":          "<your_github_org>",

  // Cognito (ALB) — `init` registers callback URLs here; `destroy` removes them:
  "cognitoUserPoolId":      "<user_pool_id>",
  "cognitoAlbClientId":     "<cognito_alb_client_id>",
  "cognitoUserPoolArn":     "<user_pool_arn>",
  "cognitoUserPoolDomain":  "<user_pool_domain>",
  "acmCertificateArn":      "<acm_certificate_arn>",

  // Runtime selection:
  "defaultRuntime": "ecs",
  "runtimes": {
    "ecs":        { "templateRepo": "ecs-prototype-template",        "clusterName": "prototype-ecs-dev", "needsEcr": true,  "deployRoleArn": "arn:aws:iam::<account>:role/github-actions-prototype-ecs-dev" },
    "eks":        { "templateRepo": "eks-prototype-template",        "clusterName": "prototype-dev",     "needsEcr": true,  "deployRoleArn": "arn:aws:iam::<account>:role/github-actions-prototype-dev" },
    "lambda":     { "templateRepo": "lambda-prototype-template",     "albName":     "prototype-lambda-dev", "needsEcr": false, "deployRoleArn": "arn:aws:iam::<account>:role/github-actions-prototype-lambda-dev" },
    "lambda-web": { "templateRepo": "lambda-web-prototype-template", "albName":     "prototype-lambda-dev", "needsEcr": true,  "deployRoleArn": "arn:aws:iam::<account>:role/github-actions-prototype-lambda-dev" }
  }
}
```

### Environment variables

| Variable | Field it overrides | Notes |
|---|---|---|
| `AUTH_PROVIDER` | `authProvider` | `cognito` (default) or `okta`. |
| `AUTH_ISSUER` | `authIssuer` | Okta only. |
| `AUTH_CLIENT_ID` | `authClientId` | Either provider. |
| `COGNITO_DOMAIN` | `cognitoDomain` | Cognito only. |
| `CALLBACK_PORT` | `callbackPort` | Defaults to `8765`. |
| `AWS_REGION` | `awsRegion` | Defaults to `ap-northeast-1`. |
| `AWS_ACCOUNT_ID` | `awsAccountId` | |
| `PROTOTYPE_BASE_DOMAIN` | `baseDomain` | |
| `GITHUB_ORG` | `githubOrg` | |
| `COGNITO_USER_POOL_ID` | `cognitoUserPoolId` | |
| `COGNITO_ALB_CLIENT_ID` | `cognitoAlbClientId` | |
| `COGNITO_USER_POOL_ARN` | `cognitoUserPoolArn` | |
| `COGNITO_USER_POOL_DOMAIN` | `cognitoUserPoolDomain` | |
| `ACM_CERTIFICATE_ARN` | `acmCertificateArn` | |
| `GITHUB_TOKEN` | — | Used directly when `gh auth token` is unavailable. Needs `administration` scope. |

### Runtime entry shape

Each value in the `runtimes` map is:

| Key | Type | Notes |
|---|---|---|
| `templateRepo` | string | Name of the GitHub template repo to clone for new services (under `githubOrg`). |
| `clusterName` | string? | EKS / ECS only — used to discover the cluster at `init` and `destroy` time. Omit for Lambda runtimes. |
| `albName` | string? | Lambda runtimes only — name of the shared ALB used to find listener rules during teardown. For ECS/EKS it equals `clusterName`, so it's omitted. |
| `needsEcr` | boolean | `true` for container runtimes (ecs/eks, lambda-web); `false` for zip Lambda. Controls whether `init` provisions an ECR repository and passes `ECR_REPOSITORY` to the deploy pipeline. |
| `deployRoleArn` | string? | Optional. ARN of the GitHub Actions deploy role passed to the service pipeline as `DEPLOY_ROLE_ARN`. Defaults to `arn:aws:iam::<account>:role/github-actions-prototype` (the EKS base stack's un-suffixed role name); ECS / Lambda runtimes must supply their own. |

### Legacy (single-runtime) configs

Pre-multi-runtime configs that used the top-level `clusterName` /
`githubTemplateRepo` fields still load — they're folded into an
`runtimes.eks` entry automatically. New configs should use the `runtimes` map.

## What `init` actually does

In order, with rollback on failure:

1. Cognito — adds `https://<name>.<baseDomain>/oauth2/idpresponse` to the
   ALB client's `callback_urls` and `<name>.<baseDomain>/logout` to
   `logout_urls`.
2. GitHub — creates the private repo `prototype-<name>` from the runtime's
   template, then sets these Actions variables: `SERVICE_NAME`,
   `AWS_ACCOUNT_ID`, `AWS_REGION`, `INGRESS_HOST`, `ACM_CERTIFICATE_ARN`,
   `COGNITO_USER_POOL_ARN`, `COGNITO_CLIENT_ID`,
   `COGNITO_USER_POOL_DOMAIN`, `RUNTIME`, `DEPLOY_ROLE_ARN`. Plus
   `CLUSTER_NAME`, `ALB_NAME`, and `ECR_REPOSITORY` when the runtime needs them.
3. ECR — when the runtime sets `needsEcr`, creates `prototype/<name>` with
   image-tag immutability enabled and (for `lambda-web`) the repository policy
   that lets the Lambda service pull the image.

Re-running `init` on an existing name fails at the pre-flight check rather than
overwriting anything.

## What `destroy` actually does

Reads the `RUNTIME` Actions variable off the service repo so the teardown
matches how the service was deployed, then:

1. Compute — `helm uninstall` (EKS), `aws ecs delete-service` + ALB rule
   removal (ECS), or `aws lambda delete-function` + ALB rule removal (Lambda).
2. Cognito — removes the callback / logout URL pair.
3. ECR — `aws ecr delete-repository --force`.
4. GitHub — `gh repo delete` (skipped when `--keep-repo` is passed).

Each step is independent; failure of one is reported but does not abort the
others.

## Development

```bash
npm install
npm run build         # tsup → dist/ (esm, sourcemaps, node20 target)
npm run typecheck     # tsc, type-check only
```

`bin/prototype.js` is a 2-line shim that imports `dist/index.js`, so a rebuild
is enough to pick up source changes once linked with `npm link`.
