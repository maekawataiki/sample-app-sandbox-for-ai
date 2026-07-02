variable "name_prefix" {
  description = "Prefix applied to platform resource names (Cognito user pool, ALB client, CLI client, tag ManagedBy)."
  type        = string
}

variable "aws_account_id" {
  type = string
}

variable "dash" {
  description = "Empty string, or \"-<suffix>\" when the deployment has a workspace suffix. Keeps the Cognito hosted domain unique per deployment."
  type        = string
}

variable "subdomain" {
  description = "Base subdomain services are published under, e.g. prototype.example.com or prototype-<suffix>.example.com."
  type        = string
}

variable "cognito_mfa_configuration" {
  description = "Cognito MFA enforcement: OFF, OPTIONAL, or ON."
  type        = string
  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.cognito_mfa_configuration)
    error_message = "cognito_mfa_configuration must be one of OFF, OPTIONAL, or ON."
  }
}
