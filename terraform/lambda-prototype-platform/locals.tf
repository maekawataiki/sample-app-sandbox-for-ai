# Inherit the network and deployment suffix from the lambda-prototype (base)
# stack via remote state — same workspace, same suffix.
data "terraform_remote_state" "base" {
  backend   = "s3"
  workspace = terraform.workspace
  config = {
    bucket = var.state_bucket
    key    = "lambda-prototype/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  base              = data.terraform_remote_state.base.outputs
  suffix            = try(local.base.suffix, "")
  dash              = local.suffix == "" ? "" : "-${local.suffix}"
  name              = local.base.alb_name # doubles as the shared ALB name
  vpc_id            = local.base.vpc_id
  public_subnet_ids = local.base.public_subnet_ids
  subdomain         = local.suffix == "" ? "prototype.${var.base_domain}" : "prototype-${local.suffix}.${var.base_domain}"
}
