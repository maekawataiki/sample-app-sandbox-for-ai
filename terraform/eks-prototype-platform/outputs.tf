output "prototype_zone_id" {
  value = aws_route53_zone.prototype.zone_id
}

output "alb_controller_role_arn" {
  value = aws_iam_role.alb_controller.arn
}
