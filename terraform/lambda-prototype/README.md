# `lambda-prototype` (base stack)

VPC (used only by the ALB — Lambda functions are not VPC-attached), the
shared Lambda execution role, the GitHub OIDC provider, and the GitHub
Actions deploy role. Apply this **before**
[`lambda-prototype-platform`](../lambda-prototype-platform/).

Shared between the `lambda` (native handler) and `lambda-web` (Lambda Web
Adapter, container image) runtimes — both ride the same base and platform
stacks.

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `aws_region` | `ap-northeast-1` | |
| `name` | `prototype-lambda` | Base platform name. Suffix is appended. Doubles as the shared ALB name and the exec-role prefix. Keep `base + suffix ≤ 32` chars. |
| `suffix` | `""` | Optional deployment suffix; workspace name is used when empty. |
| `create_github_oidc_provider` | `true` | Set `false` after the first deployment in this account. |
| `vpc_cidr` | `10.120.0.0/16` | |
| `github_org` | **required** | GitHub organisation owning prototype service repos. |
| `github_repo_pattern` | `prototype-*` | Repo-name glob allowed to assume the deploy role. |

## Outputs

| Name | Notes |
|---|---|
| `suffix` | Inherited by the platform stack. |
| `vpc_id` / `public_subnet_ids` | Inherited by the platform stack (no private subnets — ALB only). |
| `lambda_exec_role_arn` | Shared execution role attached to every prototype function. Attach extra policies here for app-side AWS access. |
| `alb_name` | Name of the shared ALB the platform stack will create. Plug into `runtimes.lambda.albName` / `runtimes.lambda-web.albName` in the CLI config. |
| `github_actions_deploy_role_arn` | OIDC-assumable role for the service pipelines. Plug into `runtimes.lambda.deployRoleArn` / `runtimes.lambda-web.deployRoleArn`. |

## Apply

```bash
terraform init \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="dynamodb_table=${TF_LOCK_TABLE}"
terraform apply -var "github_org=<your_github_org>"
```
