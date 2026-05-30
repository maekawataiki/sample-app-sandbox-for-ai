# Inherit the network and the deployment suffix from the ecs-prototype (base)
# stack via remote state — same workspace, same suffix, no tag guessing.
data "terraform_remote_state" "base" {
  backend   = "s3"
  workspace = terraform.workspace
  config = {
    bucket = var.state_bucket
    key    = "ecs-prototype/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  base               = data.terraform_remote_state.base.outputs
  suffix             = try(local.base.suffix, "")
  dash               = local.suffix == "" ? "" : "-${local.suffix}"
  name               = local.base.cluster_name # doubles as the shared ALB name
  vpc_id             = local.base.vpc_id
  public_subnet_ids  = local.base.public_subnet_ids
  private_subnet_ids = local.base.private_subnet_ids
  # Default suffix → the original prototype.<domain>; otherwise a distinct zone.
  subdomain = local.suffix == "" ? "prototype.${var.base_domain}" : "prototype-${local.suffix}.${var.base_domain}"
}
