output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_arn" {
  value = aws_cognito_user_pool.main.arn
}

output "cognito_alb_client_id" {
  value = aws_cognito_user_pool_client.alb.id
}

output "cognito_cli_client_id" {
  value = aws_cognito_user_pool_client.cli.id
}

output "cognito_user_pool_domain" {
  value = aws_cognito_user_pool_domain.main.domain
}
