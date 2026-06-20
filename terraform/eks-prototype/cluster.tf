resource "aws_eks_cluster" "prototype" {
  name                          = local.name
  role_arn                      = aws_iam_role.cluster.arn
  version                       = var.cluster_version
  bootstrap_self_managed_addons = false

  enabled_cluster_log_types = var.cluster_log_types

  compute_config {
    enabled       = true
    node_pools    = ["general-purpose"]
    node_role_arn = aws_iam_role.node.arn
  }

  kubernetes_network_config {
    elastic_load_balancing {
      enabled = true
    }
  }

  storage_config {
    block_storage {
      enabled = true
    }
  }

  access_config {
    authentication_mode = "API"
  }

  vpc_config {
    subnet_ids              = concat(aws_subnet.public[*].id, aws_subnet.private[*].id)
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.cluster_public_access_cidrs
  }

  depends_on = [
    aws_iam_role_policy_attachment.cluster,
    aws_iam_role_policy_attachment.node,
  ]
}

# CloudWatch log group for EKS control plane logs (created with a fixed retention
# so the cluster doesn't accrue logs forever).
resource "aws_cloudwatch_log_group" "eks_control_plane" {
  name              = "/aws/eks/${local.name}/cluster"
  retention_in_days = 30
}

locals {
  cluster_admin_principal_arn = (
    var.cluster_admin_principal_arn != null
    ? var.cluster_admin_principal_arn
    : data.aws_caller_identity.current.arn
  )
}

# Grant cluster admin to the IAM principal running Terraform (or the override).
resource "aws_eks_access_entry" "admin" {
  cluster_name  = aws_eks_cluster.prototype.name
  principal_arn = local.cluster_admin_principal_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "admin" {
  cluster_name  = aws_eks_cluster.prototype.name
  principal_arn = aws_eks_access_entry.admin.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}

# GitHub Actions: edit access scoped to prototype namespace
resource "aws_eks_access_entry" "github_actions" {
  cluster_name  = aws_eks_cluster.prototype.name
  principal_arn = aws_iam_role.github_actions_deploy.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_actions" {
  cluster_name  = aws_eks_cluster.prototype.name
  principal_arn = aws_eks_access_entry.github_actions.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["prototype"]
  }
}
