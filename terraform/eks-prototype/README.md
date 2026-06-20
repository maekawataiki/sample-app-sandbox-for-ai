# `eks-prototype` (base stack)

VPC, EKS Auto Mode cluster, IAM roles, the GitHub OIDC provider and the
GitHub Actions deploy role. The cluster admin and the GitHub Actions
principal get EKS access entries here. Apply this **before**
[`eks-prototype-platform`](../eks-prototype-platform/).

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `aws_region` | `ap-northeast-1` | Override consistently across all stacks and `terraform init`. |
| `cluster_name` | `prototype` | Base name. Suffix is appended (e.g. `prototype-dev`). |
| `suffix` | `""` | Optional deployment suffix; the workspace name is used when this is empty. |
| `create_github_oidc_provider` | `true` | Set `false` after the first deployment in this account. |
| `cluster_version` | `1.31` | EKS version. |
| `vpc_cidr` | `10.100.0.0/16` | |
| `github_org` | **required** | GitHub organisation owning prototype service repos. |
| `github_repo_pattern` | `prototype-*` | Repo-name glob allowed to assume the deploy role. |
| `cluster_public_access_cidrs` | **required** | CIDRs allowed to reach the public EKS API endpoint. No default — must be set explicitly so accidentally exposing `0.0.0.0/0` is a conscious decision. Use office / VPN ranges, or `["0.0.0.0/0"]` if you accept the trade-off. |
| `cluster_admin_principal_arn` | calling identity | IAM role/user ARN granted EKS cluster-admin via `aws_eks_access_entry`. Access entries reject STS session ARNs — pass the underlying IAM role ARN if you apply from an assumed role. |
| `cluster_log_types` | `["api","audit","authenticator","controllerManager","scheduler"]` | EKS control-plane log types shipped to CloudWatch. |

## Outputs

| Name | Notes |
|---|---|
| `suffix` | Inherited by the platform stack. |
| `cluster_name` / `cluster_endpoint` / `cluster_certificate_authority_data` / `oidc_issuer_url` | EKS cluster connection info. |
| `vpc_id` / `public_subnet_ids` / `private_subnet_ids` | Inherited by the platform stack. |
| `github_actions_deploy_role_arn` | OIDC-assumable role for the service pipelines. Plug into `runtimes.eks.deployRoleArn` in the CLI config. |

## Apply

```bash
terraform init \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="dynamodb_table=${TF_LOCK_TABLE}"
terraform apply \
  -var "github_org=<your_github_org>" \
  -var 'cluster_public_access_cidrs=["203.0.113.0/24"]'
```

If you apply from an assumed role, also pass
`-var "cluster_admin_principal_arn=arn:aws:iam::<account>:role/<role>"` so
the access entry uses the underlying IAM role ARN.
