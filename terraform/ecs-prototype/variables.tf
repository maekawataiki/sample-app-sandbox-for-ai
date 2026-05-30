variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "cluster_name" {
  description = "Base ECS cluster name. The deployment suffix is appended (e.g. prototype-ecs-dev). The result is also the shared ALB name and the task-role prefix, so keep base + suffix <= 32 chars."
  type        = string
  default     = "prototype-ecs"
}

variable "suffix" {
  description = "Deployment suffix so multiple installs can coexist in one account. Empty keeps the original un-suffixed names — re-applying an existing install is a no-op. Tip: use a Terraform workspace per deployment; the workspace name becomes the suffix when this is unset (\"default\" stays un-suffixed)."
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "An AWS account can hold only one OIDC provider per URL. Set false on every deployment after the first so the others reference the existing token.actions.githubusercontent.com provider instead of recreating it."
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  type    = string
  default = "10.110.0.0/16"
}

variable "container_port" {
  description = "Port the service container listens on. The service security group allows the ALB to reach tasks on this port."
  type        = number
  default     = 8080
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
