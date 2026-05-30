# Inherit the cluster name, deployment suffix, and VPC from the eks-prototype
# (base) stack via remote state — same workspace, same suffix.
data "terraform_remote_state" "base" {
  backend   = "s3"
  workspace = terraform.workspace
  config = {
    bucket = var.state_bucket
    key    = "eks-prototype/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  base         = data.terraform_remote_state.base.outputs
  suffix       = try(local.base.suffix, "")
  dash         = local.suffix == "" ? "" : "-${local.suffix}"
  cluster_name = local.base.cluster_name
  vpc_id       = local.base.vpc_id
  # Default suffix → the original prototype.<domain>; otherwise a distinct zone.
  subdomain = local.suffix == "" ? "prototype.${var.base_domain}" : "prototype-${local.suffix}.${var.base_domain}"
}
