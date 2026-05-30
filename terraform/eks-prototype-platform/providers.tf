terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.85"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.17"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_eks_cluster" "prototype" {
  name = local.cluster_name
}

data "aws_eks_cluster_auth" "prototype" {
  name = local.cluster_name
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.prototype.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.prototype.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.prototype.token
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.prototype.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.prototype.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.prototype.token
  }
}
