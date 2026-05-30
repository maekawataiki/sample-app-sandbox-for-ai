# Reporting Security Issues

We take security seriously. If you discover a potential security issue in this
project, please **do not** create a public GitHub issue.

## How to report

Report vulnerabilities to AWS Security via
**[aws-security@amazon.com](mailto:aws-security@amazon.com)** or through the
[AWS vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/).

Please include:

- A description of the issue and the impact.
- Steps to reproduce, including affected commit hash, Terraform stack, or
  CLI command.
- Any proof-of-concept code (kept private).

Do **not** include AWS account IDs, real domain names, IAM role ARNs, or
credentials in the report. Use placeholders.

## What to expect

- We will acknowledge receipt within 3 business days.
- We will work with you to confirm the issue, develop a fix, and coordinate
  disclosure.
- We do not currently run a bug bounty for this repository, but credit will
  be given in the fix commit and changelog where appropriate.

## Scope

This repository is a sample / reference implementation. Issues that depend on
the consumer deploying it with insecure overrides (`cluster_public_access_cidrs
= ["0.0.0.0/0"]`, weaker password policy, etc.) are out of scope; defaults
must remain secure.

In-scope examples:

- Vulnerabilities in the CLI, Terraform stacks, Helm chart, or generated
  service template under default settings.
- IAM policies that grant broader access than documented.
- Authentication bypasses on the shared ALB / Cognito flow.
