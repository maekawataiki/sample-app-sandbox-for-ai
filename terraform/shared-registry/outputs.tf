output "codeartifact_domain" {
  value = aws_codeartifact_domain.prototype.domain
}

output "codeartifact_domain_owner" {
  value = aws_codeartifact_domain.prototype.owner
}

output "codeartifact_repository" {
  value = aws_codeartifact_repository.npm.repository
}

output "codeartifact_repository_endpoint" {
  description = "npm endpoint — use with `npm config set @prototype:registry <value>` or `aws codeartifact login`."
  value       = "https://${aws_codeartifact_domain.prototype.domain}-${aws_codeartifact_domain.prototype.owner}.d.codeartifact.${var.aws_region}.amazonaws.com/npm/${aws_codeartifact_repository.npm.repository}/"
}
