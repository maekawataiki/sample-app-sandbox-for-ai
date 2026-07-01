# Created on the first deployment; referenced (not recreated) on the rest — an
# account holds only one OIDC provider per URL. Toggle via create_github_oidc_provider.
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

# Migrate an OIDC provider created before the count was introduced, so adding
# the toggle doesn't destroy/recreate it. No-op when no prior state exists.
moved {
  from = aws_iam_openid_connect_provider.github
  to   = aws_iam_openid_connect_provider.github[0]
}

# Suffix-scoped role name so deployments don't collide. The service template's
# workflow gets the ARN via the DEPLOY_ROLE_ARN variable set by `prototype init`.
resource "aws_iam_role" "github_actions_deploy" {
  name = "github-actions-${local.name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.github_oidc_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo_pattern}:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "ecs-deploy-prototype"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuth"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/prototype/*"
      },
      {
        # ECS: register task defs (resource-level not supported for register),
        # and manage services within this cluster.
        Sid    = "EcsDeploy"
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:CreateService",
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:ListServices",
          "ecs:TagResource",
        ]
        Resource = "*"
      },
      {
        # ELBv2 resource-level permissions are limited, so the listener-rule and
        # target-group calls the deploy makes are granted at account scope.
        Sid    = "AlbWiring"
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:AddTags",
        ]
        Resource = "*"
      },
      {
        Sid    = "NetworkDiscovery"
        Effect = "Allow"
        Action = [
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
        ]
        Resource = "*"
      },
      {
        # Creating an authenticate-cognito listener rule makes ELB validate the
        # user-pool client on the caller's behalf.
        Sid      = "CognitoValidate"
        Effect   = "Allow"
        Action   = "cognito-idp:DescribeUserPoolClient"
        Resource = "arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/*"
      },
      {
        # The deploy passes the two shared roles to ECS when registering a task
        # definition. Scoped to exactly those roles.
        Sid      = "PassTaskRoles"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [aws_iam_role.task_execution.arn, aws_iam_role.task.arn]
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
      {
        # `aws codeartifact login` exchanges an STS token for a CodeArtifact
        # auth token — required before `npm ci` can resolve @prototype/* deps.
        Sid      = "CodeArtifactAuth"
        Effect   = "Allow"
        Action   = "sts:GetServiceBearerToken"
        Resource = "*"
        Condition = {
          StringEquals = { "sts:AWSServiceName" = "codeartifact.amazonaws.com" }
        }
      },
      {
        Sid    = "CodeArtifactRead"
        Effect = "Allow"
        Action = [
          "codeartifact:GetAuthorizationToken",
          "codeartifact:GetRepositoryEndpoint",
          "codeartifact:ReadFromRepository",
        ]
        Resource = [
          "arn:aws:codeartifact:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/${var.codeartifact_domain}",
          "arn:aws:codeartifact:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.codeartifact_domain}/${var.codeartifact_repository}",
        ]
      },
    ]
  })
}

output "github_actions_deploy_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}
