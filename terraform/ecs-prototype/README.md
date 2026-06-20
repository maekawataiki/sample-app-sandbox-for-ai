# `ecs-prototype` (base stack)

VPC, ECS Fargate cluster, the two shared task roles, the GitHub OIDC provider
and the GitHub Actions deploy role. Apply this **before**
[`ecs-prototype-platform`](../ecs-prototype-platform/).

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `aws_region` | `ap-northeast-1` | Override consistently across all stacks and `terraform init -backend-config="region=..."`. |
| `cluster_name` | `prototype-ecs` | Base name. Suffix is appended (e.g. `prototype-ecs-dev`). Doubles as the shared ALB name. Keep `base + suffix ≤ 32` chars. |
| `suffix` | `""` | Optional deployment suffix. Empty keeps the original un-suffixed names. Tip: use a Terraform workspace instead — the workspace name becomes the suffix automatically when this is unset. |
| `create_github_oidc_provider` | `true` | Set `false` on every base-stack apply *after the first one in this account*. An AWS account can hold only one OIDC provider per issuer URL. |
| `vpc_cidr` | `10.110.0.0/16` | |
| `container_port` | `8080` | Must match the `container_port` in the platform stack — the shared service security group only opens this port. |
| `github_org` | **required** | GitHub organisation that owns prototype service repos. |
| `github_repo_pattern` | `prototype-*` | Repo-name glob allowed to assume the deploy role via OIDC. |

## Outputs

| Name | Notes |
|---|---|
| `suffix` | The resolved suffix (var or workspace). Inherited by the platform stack via `terraform_remote_state`. |
| `cluster_name` / `cluster_arn` | ECS cluster name + ARN. Also the shared ALB name. |
| `vpc_id` / `public_subnet_ids` / `private_subnet_ids` | Inherited by the platform stack. |
| `task_execution_role_arn` | Used by ECS to pull images and ship logs. |
| `task_role_arn` | Application-side AWS permissions. Attach extra policies here. |
| `log_group_name` | CloudWatch Logs group every service streams to. |
| `github_actions_deploy_role_arn` | OIDC-assumable role for the service pipelines. Plug into `runtimes.ecs.deployRoleArn` in the CLI config. |

## Apply

```bash
terraform init \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="dynamodb_table=${TF_LOCK_TABLE}"
terraform apply -var "github_org=<your_github_org>"
```

For a non-default deployment, add `-var "suffix=dev"` (or work in a
non-`default` Terraform workspace), and `-var "create_github_oidc_provider=false"`
if the OIDC provider already exists in the account.
