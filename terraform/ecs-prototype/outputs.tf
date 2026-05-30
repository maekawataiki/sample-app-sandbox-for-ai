output "suffix" {
  value = local.suffix
}

output "cluster_name" {
  value = aws_ecs_cluster.prototype.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.prototype.arn
}

output "vpc_id" {
  value = aws_vpc.prototype.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "task_execution_role_arn" {
  value = aws_iam_role.task_execution.arn
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.services.name
}
