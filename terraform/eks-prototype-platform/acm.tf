module "acm" {
  source = "../modules/acm-wildcard"

  subdomain = local.subdomain
  zone_id   = aws_route53_zone.prototype.zone_id
}

output "acm_certificate_arn" {
  value = module.acm.acm_certificate_arn
}
