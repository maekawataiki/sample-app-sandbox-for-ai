variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "aws_account_id" {
  type = string
}

variable "state_bucket" {
  description = "S3 bucket holding the base stack's tfstate (passed to the terraform_remote_state data source). Same bucket you pass to `terraform init -backend-config=bucket=...`."
  type        = string
}

variable "name_prefix" {
  description = "Prefix applied to platform resource names (Cognito user pool, ALB client, CLI client, tag ManagedBy). Change if the default collides with another deployment in the account or with the globally-unique Cognito hosted-domain you want."
  type        = string
  default     = "prototype-platform"
}

# The platform name, suffix, VPC and subnets are inherited from the
# lambda-prototype stack via remote state (see locals.tf).

variable "base_domain" {
  description = "Root domain. Prototype services at <name>.prototype.<base_domain>"
  type        = string
}

variable "alb_ingress_cidrs" {
  description = "CIDRs allowed to reach the shared ALB on 443. The ALB is internet-facing but every service sits behind Cognito auth; narrow this for defence in depth."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "cognito_mfa_configuration" {
  description = "Cognito MFA enforcement: OFF, OPTIONAL, or ON. Default OPTIONAL — users can opt in to TOTP."
  type        = string
  default     = "OPTIONAL"
  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.cognito_mfa_configuration)
    error_message = "cognito_mfa_configuration must be one of OFF, OPTIONAL, or ON."
  }
}
