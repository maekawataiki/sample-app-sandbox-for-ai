# `lambda-prototype-platform` (platform stack)

Cognito user pool + clients, wildcard ACM certificate, Route53 hosted zone +
wildcard A record, and the shared ALB + HTTPS:443 listener. Reads the VPC,
ALB name, and suffix from [`lambda-prototype`](../lambda-prototype/) via
`terraform_remote_state` — apply that stack first.

Shared between the `lambda` and `lambda-web` runtimes.

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `aws_region` | `ap-northeast-1` | Must match the base stack. |
| `aws_account_id` | **required** | Used in the Cognito hosted-domain to keep it globally unique. |
| `state_bucket` | **required** | S3 bucket holding the base stack's `tfstate`. |
| `name_prefix` | `prototype-platform` | Applied to Cognito and the `ManagedBy` tag. |
| `base_domain` | **required** | Root domain hosted in Route53. |
| `alb_ingress_cidrs` | `["0.0.0.0/0"]` | CIDRs allowed to reach the shared ALB on 443. Narrow this for defence in depth — every service still sits behind Cognito. |
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
| `alb_name` | Same value as the base stack's `alb_name` — plug into both `runtimes.lambda.albName` and `runtimes.lambda-web.albName`. |
| `alb_dns_name` / `https_listener_arn` | Consumed by the per-service deploy script. |
| `prototype_zone_id` / `prototype_zone_name_servers` | Route53 zone for `prototype.<base_domain>`. NS delegation is automatic. |

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
