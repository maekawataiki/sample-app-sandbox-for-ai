resource "aws_cognito_user_pool" "main" {
  name = var.name_prefix

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 14
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  mfa_configuration = var.cognito_mfa_configuration

  dynamic "software_token_mfa_configuration" {
    for_each = var.cognito_mfa_configuration == "OFF" ? [] : [1]
    content {
      enabled = true
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    developer_only_attribute = false
    mutable                  = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = {
    ManagedBy = var.name_prefix
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.name_prefix}-${var.aws_account_id}${local.dash}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "alb" {
  name         = "${var.name_prefix}-alb"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = true

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "profile", "email"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = ["https://placeholder.${local.subdomain}/oauth2/idpresponse"]
  logout_urls   = ["https://placeholder.${local.subdomain}/logout"]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"

  lifecycle {
    ignore_changes = [generate_secret, callback_urls, logout_urls]
  }
}

resource "aws_cognito_user_pool_client" "cli" {
  name         = "${var.name_prefix}-cli"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "profile", "email"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = ["http://localhost:8765/callback"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"

  lifecycle {
    ignore_changes = [generate_secret]
  }
}

resource "aws_cognito_user_pool_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Platform administrators — full access to all prototype services"
}

resource "aws_cognito_user_pool_group" "engineering" {
  name         = "engineering"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Engineering team — default access group for prototype services"
}

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
