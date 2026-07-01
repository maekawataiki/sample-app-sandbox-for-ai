variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "cluster_name" {
  description = "Base EKS cluster name. The deployment suffix is appended (e.g. prototype-dev)."
  type        = string
  default     = "prototype"
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

variable "cluster_version" {
  type    = string
  default = "1.31"
}

variable "vpc_cidr" {
  type    = string
  default = "10.100.0.0/16"
}

variable "github_org" {
  description = "GitHub organisation (or user) that owns prototype service repos."
  type        = string
}

variable "github_repo_pattern" {
  description = "Glob applied to repo names (under github_org) allowed to assume the ECR-push role. Defaults to repos created by `prototype init`."
  type        = string
  default     = "prototype-*"
}

variable "cluster_public_access_cidrs" {
  description = "CIDR blocks allowed to reach the EKS public API endpoint. No default — must be set explicitly so accidentally exposing 0.0.0.0/0 takes a conscious decision. Set to e.g. [\"203.0.113.0/24\"] for office/VPN ranges, or [\"0.0.0.0/0\"] if you accept the trade-off."
  type        = list(string)
  validation {
    condition     = length(var.cluster_public_access_cidrs) > 0
    error_message = "cluster_public_access_cidrs must contain at least one CIDR. Pass an explicit list (e.g. office/VPN ranges, or [\"0.0.0.0/0\"] to keep the previous behaviour)."
  }
}

variable "cluster_admin_principal_arn" {
  description = "IAM role/user ARN granted EKS cluster-admin via aws_eks_access_entry. Defaults to the calling identity (data.aws_caller_identity.current.arn). EKS access entries do not accept STS assumed-role session ARNs — pass the underlying IAM role ARN if you apply from an assumed role."
  type        = string
  default     = null
}

variable "cluster_log_types" {
  description = "EKS control plane log types to ship to CloudWatch."
  type        = list(string)
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
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
