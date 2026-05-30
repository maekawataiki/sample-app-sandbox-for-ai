# --- Security groups ---------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Shared ALB for prototype ECS services"
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
  description       = "Allow ALB to reach targets"
}

# Tasks accept traffic only from the ALB, on the container port. The per-service
# deploy attaches every Fargate service to this shared SG.
resource "aws_security_group" "service" {
  name        = "${local.name}-service"
  description = "Fargate tasks for prototype ECS services"
  vpc_id      = local.vpc_id
  tags        = { Name = "${local.name}-service" }
}

resource "aws_vpc_security_group_ingress_rule" "service_from_alb" {
  security_group_id            = aws_security_group.service.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.container_port
  to_port                      = var.container_port
  ip_protocol                  = "tcp"
  description                  = "Container port from the shared ALB"
}

resource "aws_vpc_security_group_egress_rule" "service_all" {
  security_group_id = aws_security_group.service.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Allow tasks egress (ECR pull, external APIs) via NAT"
}

# --- Shared ALB + HTTPS listener --------------------------------------------

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
# (host-header → authenticate-cognito → forward) are added by each service's
# deploy pipeline and are intentionally not managed here.
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

output "service_security_group_id" {
  value = aws_security_group.service.id
}

output "private_subnet_ids" {
  value = local.private_subnet_ids
}
