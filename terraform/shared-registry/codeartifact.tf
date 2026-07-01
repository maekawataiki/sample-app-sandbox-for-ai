# CodeArtifact domain — shared internal npm registry for @prototype/* packages
# (e.g. @prototype/cedar-auth). Applied once per account; every runtime's
# GitHub Actions deploy role is granted read access via a policy attached in
# its own base stack (terraform/<runtime>-prototype/iam.tf).
resource "aws_codeartifact_domain" "prototype" {
  domain = var.domain_name
}

# Upstream store that proxies the public npm registry, so express/typescript/
# etc. resolve through CodeArtifact too — one registry endpoint for consumers.
resource "aws_codeartifact_repository" "npm_store" {
  domain      = aws_codeartifact_domain.prototype.domain
  repository  = "npm-store"
  description = "Upstream store proxying the public npm registry."

  external_connections {
    external_connection_name = "public:npmjs"
  }
}

# Repository that @prototype/* packages are published to. Falls through to
# npm-store (and so to public npm) for any dependency it doesn't host itself.
resource "aws_codeartifact_repository" "npm" {
  domain      = aws_codeartifact_domain.prototype.domain
  repository  = var.repository_name
  description = "Hosts @prototype/* packages; falls through to npm-store for public deps."

  upstream {
    repository_name = aws_codeartifact_repository.npm_store.repository
  }
}
