resource "aws_route53_zone" "prototype" {
  name = local.subdomain
}

# Delegate <subdomain> → the new zone directly from the root domain zone. The
# suffix is folded into one label (prototype-<suffix>.<domain>) so deployments
# don't shadow each other.
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

# ALB created by aws-load-balancer-controller. The group.name stays "prototype";
# the per-deployment cluster tag (suffixed) makes this lookup unique.
data "aws_lb" "prototype" {
  tags = {
    "ingress.k8s.aws/stack" = "prototype"
    "elbv2.k8s.aws/cluster" = local.cluster_name
  }
}

# Wildcard A record — all *.<subdomain> → shared ALB
resource "aws_route53_record" "wildcard" {
  zone_id = aws_route53_zone.prototype.zone_id
  name    = "*.${local.subdomain}"
  type    = "A"

  alias {
    name                   = data.aws_lb.prototype.dns_name
    zone_id                = data.aws_lb.prototype.zone_id
    evaluate_target_health = true
  }
}

output "prototype_zone_name_servers" {
  description = "NS records delegated into route53 zone automatically"
  value       = aws_route53_zone.prototype.name_servers
}

output "alb_dns_name" {
  value = data.aws_lb.prototype.dns_name
}
