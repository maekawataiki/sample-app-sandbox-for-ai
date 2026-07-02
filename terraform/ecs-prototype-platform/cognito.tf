module "cognito" {
  source = "../modules/cognito-platform"

  name_prefix               = var.name_prefix
  aws_account_id            = var.aws_account_id
  dash                      = local.dash
  subdomain                 = local.subdomain
  cognito_mfa_configuration = var.cognito_mfa_configuration
}

output "cognito_user_pool_id" {
  value = module.cognito.cognito_user_pool_id
}

output "cognito_user_pool_arn" {
  value = module.cognito.cognito_user_pool_arn
}

output "cognito_alb_client_id" {
  value = module.cognito.cognito_alb_client_id
}

output "cognito_cli_client_id" {
  value = module.cognito.cognito_cli_client_id
}

output "cognito_user_pool_domain" {
  value = module.cognito.cognito_user_pool_domain
}
