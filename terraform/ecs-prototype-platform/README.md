# `ecs-prototype-platform` (platform stack)

Cognito user pool + clients, wildcard ACM certificate, Route53 hosted zone +
wildcard A record, the shared ALB + HTTPS:443 listener, and the service
security group. Reads the VPC, cluster name, and suffix from
[`ecs-prototype`](../ecs-prototype/) via `terraform_remote_state` — apply that
stack first.

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `aws_region` | `ap-northeast-1` | Must match the base stack. |
| `aws_account_id` | **required** | Used in the Cognito hosted-domain (`<name_prefix>-<account_id>`) to keep it globally unique. |
| `state_bucket` | **required** | S3 bucket holding the base stack's `tfstate`. Same value you pass via `terraform init -backend-config="bucket=..."`. |
| `name_prefix` | `prototype-platform` | Applied to the Cognito user pool, the ALB / CLI clients, and the `ManagedBy` tag. Change if it collides with another deployment in the account, or if you need a different Cognito hosted-domain. |
| `base_domain` | **required** | Root domain hosted in Route53 in this account. Services land at `<name>.prototype.<base_domain>` (default suffix) or `<name>.prototype-<suffix>.<base_domain>`. |
| `container_port` | `8080` | Must match the base stack's `container_port`. |
| `alb_ingress_cidrs` | `["0.0.0.0/0"]` | CIDRs allowed to reach the shared ALB on 443. Every service sits behind Cognito anyway, but narrow this to office / VPN ranges for defence in depth. |
| `cognito_mfa_configuration` | `OPTIONAL` | `OFF`, `OPTIONAL`, or `ON`. |

## Outputs

| Name | Maps to `config.json` field |
|---|---|
| `cognito_user_pool_id` | `cognitoUserPoolId` |
| `cognito_user_pool_arn` | `cognitoUserPoolArn` |
| `cognito_user_pool_domain` | `cognitoUserPoolDomain` (+ `.auth.<region>.amazoncognito.com` → `cognitoDomain`) |
| `cognito_alb_client_id` | `cognitoAlbClientId` |
| `cognito_cli_client_id` | `authClientId` |
| `acm_certificate_arn` | `acmCertificateArn` |
| `alb_name` | `runtimes.ecs.clusterName` mirror — also the value passed to the deploy pipeline as `ALB_NAME`. |
| `alb_dns_name` / `https_listener_arn` / `service_security_group_id` / `private_subnet_ids` | Consumed by the per-service deploy script. |
| `prototype_zone_id` / `prototype_zone_name_servers` | Route53 zone for `prototype.<base_domain>` (or the suffixed variant). The NS delegation into the parent zone is created automatically. |

## Apply

```bash
terraform init \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="dynamodb_table=${TF_LOCK_TABLE}"
terraform apply \
  -var "aws_account_id=<account_id>" \
  -var "base_domain=<your-domain>" \
  -var "state_bucket=${TF_STATE_BUCKET}"
```
