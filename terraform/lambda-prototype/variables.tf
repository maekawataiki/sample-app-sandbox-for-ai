variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "name" {
  description = "Base platform name. The deployment suffix is appended (e.g. prototype-lambda-dev). The result is the shared ALB name and the exec-role prefix, so keep base + suffix <= 32 chars."
  type        = string
  default     = "prototype-lambda"
}

variable "suffix" {
  description = "Deployment suffix so multiple installs can coexist in one account. Empty keeps the original un-suffixed names — re-applying an existing install is a no-op. Tip: use a Terraform workspace per deployment; the workspace name becomes the suffix when this is unset (\"default\" stays un-suffixed)."
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "An AWS account can hold only one OIDC provider per URL. Set false on every deployment after the first so the others reference the existing provider."
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  type    = string
  default = "10.120.0.0/16"
}

variable "github_org" {
  description = "GitHub organisation (or user) that owns prototype service repos."
  type        = string
}

variable "github_repo_pattern" {
  description = "Glob applied to repo names (under github_org) allowed to assume the deploy role. Defaults to repos created by `prototype init`."
  type        = string
  default     = "prototype-*"
}

variable "codeartifact_domain" {
  description = "CodeArtifact domain hosting @prototype/* packages (see terraform/shared-registry). Grants the deploy role read access so `npm ci` can resolve them in CI."
  type        = string
  default     = "prototype"
}

variable "codeartifact_repository" {
  description = "CodeArtifact repository within codeartifact_domain hosting @prototype/* packages."
  type        = string
  default     = "npm"
}
