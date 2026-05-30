resource "aws_route53_zone" "prototype" {
  name = local.subdomain
}

# Delegate <subdomain> → the new zone directly from the root domain zone (kept in
# this account). Folding the suffix into one label (prototype-<suffix>.<domain>)
# avoids an intermediate prototype.<domain> zone shadowing other deployments.
data "aws_route53_zone" "parent" {
  name         = var.base_domain
  private_zone = false
}

resource "aws_route53_record" "prototype_ns" {
  zone_id = data.aws_route53_zone.parent.zone_id
  name    = local.subdomain
  type    = "NS"
  ttl     = 300
  records = aws_route53_zone.prototype.name_servers
}

# Wildcard A record — all *.<subdomain> → shared ALB. Unlike the EKS stack
# (where the ALB is created by the load-balancer controller and looked up by
# tag), here the ALB is a first-class Terraform resource (see alb.tf).
resource "aws_route53_record" "wildcard" {
  zone_id = aws_route53_zone.prototype.zone_id
  name    = "*.${local.subdomain}"
  type    = "A"

  alias {
    name                   = aws_lb.prototype.dns_name
    zone_id                = aws_lb.prototype.zone_id
    evaluate_target_health = true
  }
}

output "prototype_zone_id" {
  value = aws_route53_zone.prototype.zone_id
}

output "prototype_zone_name_servers" {
  description = "NS records delegated into the parent zone automatically"
  value       = aws_route53_zone.prototype.name_servers
}
