variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "domain_name" {
  description = "CodeArtifact domain name. Shared across every runtime — apply this stack once regardless of which runtimes (ecs/eks/lambda) are enabled."
  type        = string
  default     = "prototype"
}

variable "repository_name" {
  description = "CodeArtifact repository that hosts @prototype/* packages (e.g. cedar-auth)."
  type        = string
  default     = "npm"
}
