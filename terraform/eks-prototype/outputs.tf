output "suffix" {
  value = local.suffix
}

output "cluster_name" {
  value = aws_eks_cluster.prototype.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.prototype.endpoint
}

output "cluster_certificate_authority_data" {
  value = aws_eks_cluster.prototype.certificate_authority[0].data
}

output "oidc_issuer_url" {
  value = aws_eks_cluster.prototype.identity[0].oidc[0].issuer
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
