resource "aws_ecs_cluster" "prototype" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Fargate only — no EC2 capacity to manage. FARGATE_SPOT is available for
# cost-sensitive prototypes; the default strategy uses on-demand FARGATE.
resource "aws_ecs_cluster_capacity_providers" "prototype" {
  cluster_name       = aws_ecs_cluster.prototype.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# Shared log group — every service streams to /ecs/<cluster>/<service> via the
# awslogs driver configured in the per-service task definition.
resource "aws_cloudwatch_log_group" "services" {
  name              = "/ecs/${local.name}"
  retention_in_days = 30
}
