# Only an ALB security group is needed — Lambda targets are invoked by the ALB
# over the AWS control plane, not over the network, so there is no service SG.
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Shared ALB for prototype Lambda services"
  vpc_id      = local.vpc_id
  tags        = { Name = "${local.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each          = toset(var.alb_ingress_cidrs)
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS from allowed clients"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Allow ALB egress"
}

resource "aws_lb" "prototype" {
  name                       = local.name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = local.public_subnet_ids
  drop_invalid_header_fields = true

  tags = { Name = local.name }
}

# Terraform owns the listener and its default action only. Per-service rules
# (host-header → authenticate-cognito → forward to a lambda target group) are
# added by each service's deploy pipeline.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.prototype.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.prototype_wildcard.certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "No prototype service is registered for this host."
      status_code  = "404"
    }
  }
}

output "alb_dns_name" {
  value = aws_lb.prototype.dns_name
}

output "alb_name" {
  value = local.name
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}
