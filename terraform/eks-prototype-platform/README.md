# `eks-prototype-platform` (platform stack)

Cognito user pool + clients, wildcard ACM certificate, Route53 hosted zone
+ delegation, the `prototype` namespace, and the AWS Load Balancer
Controller IAM role (the controller itself is part of EKS Auto Mode).
Reads the cluster name, suffix, VPC and subnets from
[`eks-prototype`](../eks-prototype/) via `terraform_remote_state` — apply
that stack first.

Unlike the ECS / Lambda platform stacks this one does **not** own a
first-class ALB; the AWS Load Balancer Controller creates one per
Ingress group (`group.name: prototype`) at deploy time.

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `aws_region` | `ap-northeast-1` | Must match the base stack. |
| `aws_account_id` | **required** | Used in the Cognito hosted-domain to keep it globally unique. |
| `state_bucket` | **required** | S3 bucket holding the base stack's `tfstate`. |
| `name_prefix` | `prototype-platform` | Applied to Cognito and the `ManagedBy` tag. Change if it collides with another deployment. |
| `base_domain` | **required** | Root domain hosted in Route53. Services land at `<name>.prototype.<base_domain>` (or the suffixed variant). |
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
| `prototype_zone_id` / `prototype_zone_name_servers` | Route53 zone for `prototype.<base_domain>`. NS delegation into the parent zone is created automatically. |
| `alb_dns_name` | Looked up from the ALB-Controller-managed ALB after the first service is deployed. |
| `alb_controller_role_arn` | IAM role assumed by the AWS Load Balancer Controller service account. |

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
