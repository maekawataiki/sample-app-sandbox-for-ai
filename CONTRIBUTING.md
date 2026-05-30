# Contributing

Thank you for your interest in contributing. This document explains how to
report issues, propose changes, and submit pull requests.

## Reporting bugs / requesting features

Use [GitHub Issues](../../issues). Before filing, please search existing
issues to avoid duplicates. Include:

- A clear description of the behaviour you expected vs. what happened.
- Reproduction steps. For Terraform issues, include `terraform version` and
  the relevant `.tf` / variable values (redact account IDs and domains).
- For CLI issues, include `prototype --version`, Node.js version, OS, and the
  exact command + output.

## Security issues

**Do not file public issues for security vulnerabilities.** Report them
privately as described in [SECURITY.md](SECURITY.md).

## Submitting a pull request

1. Fork the repository and create a branch off `main`.
2. Make your change. Keep the scope small — one logical change per PR.
3. Run the security scan locally if you touched Terraform, Helm, or service
   code (`ash --config .ash/.ash.yaml`). CI will block merges on findings.
4. Update the README or template README if user-visible behaviour changes.
5. Open a PR with a clear description of *why* the change is needed. Link
   the issue it resolves.

Maintainers may ask for changes. Once approved and CI is green, a maintainer
will merge.

## Code style

- **Terraform** — `terraform fmt` before committing. Prefer variables over
  hard-coded values; the platform must remain forkable without code edits.
- **TypeScript (CLI)** — `npm run typecheck` must pass. Match the existing
  style; no formatter is enforced.
- **Shell** — `set -euo pipefail` at the top; quote variable expansions.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT-0 License](LICENSE).
