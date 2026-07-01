# Created on the first deployment; referenced on the rest (one OIDC provider per
# URL per account). Toggle via create_github_oidc_provider.
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

# Migrate an OIDC provider created before the count was introduced (no-op when
# no prior state exists).
moved {
  from = aws_iam_openid_connect_provider.github
  to   = aws_iam_openid_connect_provider.github[0]
}

# Suffix-scoped role name, aligned with the ECS/Lambda base stacks. The ARN
# reaches the service workflow via the DEPLOY_ROLE_ARN variable set by
# `prototype init`.
resource "aws_iam_role" "github_actions_deploy" {
  name = "github-actions-${local.name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = local.github_oidc_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
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
  name = "eks-deploy-prototype"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
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
        Effect   = "Allow"
        Action   = "eks:DescribeCluster"
        Resource = "arn:aws:eks:${var.aws_region}:${data.aws_caller_identity.current.account_id}:cluster/*"
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

# State migration for the rename from `github_actions_ecr_push` to
# `github_actions_deploy` (aligning with the ECS/Lambda base stacks). The IAM
# role name itself also changed
# (github-actions-prototype-ecr-push → github-actions-prototype), which
# Terraform will destroy/recreate — fine on a fresh deployment. On an existing
# deployment, the GitHub Actions OIDC trust is gone until the next apply
# completes; re-run the failed service workflows after.
moved {
  from = aws_iam_role.github_actions_ecr_push
  to   = aws_iam_role.github_actions_deploy
}

moved {
  from = aws_iam_role_policy.ecr_push
  to   = aws_iam_role_policy.deploy
}
