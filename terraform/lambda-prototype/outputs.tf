output "suffix" {
  value = local.suffix
}

output "vpc_id" {
  value = aws_vpc.prototype.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "lambda_exec_role_arn" {
  value = aws_iam_role.lambda_exec.arn
}

output "alb_name" {
  description = "Name of the shared ALB created by the platform stack. Used by `prototype destroy` and the deploy pipeline to discover the listener."
  value       = local.name
}
