output "acm_certificate_arn" {
  value = aws_acm_certificate_validation.prototype_wildcard.certificate_arn
}
