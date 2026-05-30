locals {
  # Opt-in deployment suffix so multiple installs coexist in one account. The
  # default ("") reproduces the original, un-suffixed names, so re-applying an
  # existing install is a no-op (no churn). Set var.suffix, or use a Terraform
  # workspace — its name becomes the suffix, while the "default" workspace stays
  # un-suffixed. No randomness, so names are deterministic across applies.
  suffix = var.suffix != "" ? var.suffix : (terraform.workspace != "default" ? terraform.workspace : "")
  dash   = local.suffix == "" ? "" : "-${local.suffix}"
  # Every named resource derives from this.
  name            = "${var.cluster_name}${local.dash}"
  github_oidc_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}
