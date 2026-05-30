locals {
  # Opt-in deployment suffix (see ecs-prototype for the full rationale). Default
  # "" → original names, so re-applying the existing cluster is a no-op. Use
  # var.suffix or a Terraform workspace; no randomness.
  suffix          = var.suffix != "" ? var.suffix : (terraform.workspace != "default" ? terraform.workspace : "")
  dash            = local.suffix == "" ? "" : "-${local.suffix}"
  name            = "${var.cluster_name}${local.dash}"
  github_oidc_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}
