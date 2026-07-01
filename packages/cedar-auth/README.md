# @prototype/cedar-auth

Cedar-based authorization middleware for Prototype Platform services. Adds per-request [Cedar](https://www.cedarpolicy.com/) policy evaluation to Express apps and Lambda handlers, using the Cognito user identity established by the ALB.

## How it works

1. ALB authenticates users via Cognito (existing behavior — unchanged)
2. This middleware extracts identity from the `x-amzn-oidc-data` JWT the ALB injects
3. Cedar evaluates the request against policies in the service's `cedar/` directory
4. Allowed → `req.cedarUser` populated, request proceeds. Denied → 403.

Default behavior (no `.cedar` files present): all authenticated users have full access — preserves existing platform behavior during adoption.

## Installation

### From the internal registry (AWS CodeArtifact)

The platform hosts `@prototype/*` packages in a CodeArtifact repository
(`terraform/shared-registry/` — see [root README → CodeArtifact
setup](../../README.md#codeartifact-setup-internal-npm-registry)).

Log in once per shell session (token lasts 12 hours) — this writes the
registry + auth token into your npm config, no `.npmrc` edits needed:

```bash
aws codeartifact login --tool npm \
  --domain prototype \
  --domain-owner <account_id> \
  --repository npm \
  --region <region>
```

Then install as usual:

```bash
npm install @prototype/cedar-auth
```

CI (`.github/workflows/build.yml` in every template) runs the same login
step using the GitHub Actions OIDC deploy role, which is granted
`codeartifact:ReadFromRepository` in each runtime's base stack
(`terraform/<runtime>-prototype/github_oidc.tf`).

### Local development (without registry)

```bash
# In your service repo package.json, use a file reference:
"@prototype/cedar-auth": "file:../../packages/cedar-auth"

# Build the package first:
cd packages/cedar-auth && npm run build
```

## Usage

### Express (ECS / EKS / Lambda-Web)

```javascript
const { createCedarAuth } = require('@prototype/cedar-auth');

app.use(createCedarAuth());

// req.cedarUser is available in handlers:
app.get('/', (req, res) => {
  res.json({ user: req.cedarUser?.email });
});
```

### Lambda native handler

```javascript
const { standaloneAuthorize } = require('@prototype/cedar-auth');

exports.handler = async (event) => {
  const result = await standaloneAuthorize({
    headers: event.headers,
    path: event.path,
    method: event.httpMethod,
  });
  if (!result.allowed) {
    return { statusCode: 403, body: JSON.stringify({ error: result.error }) };
  }
  // ... handler logic using result.user
};
```

### Options

```typescript
createCedarAuth({
  region?: string;          // ALB public key region (default: AWS_REGION env var)
  serviceName?: string;     // service name in Cedar entities (default: SERVICE_NAME env var)
  bypassPaths?: string[];   // paths that skip auth (default: ['/healthz'])
  policyDir?: string;       // Cedar policy directory (default: './cedar')
  allowedAlbArns?: string[];// restrict which ALBs can sign JWTs (recommended in production)
  devMode?: boolean;        // skip JWT verification — LOCAL DEVELOPMENT ONLY
  devUser?: {               // mock user when devMode is true
    email: string;
    sub: string;
    groups: string[];
  };
  watchPolicies?: boolean;  // hot-reload policies on file change (default: true in non-production)
})
```

> **`region` must be set explicitly on ECS and EKS.** Without it, `region`
> falls back to `us-east-1`, so `verifyAlbJwt` fetches the ALB's signing key
> from the wrong regional endpoint and every authenticated request fails.
> Lambda (native and Web Adapter) gets `AWS_REGION` injected automatically by
> the runtime, so it needs no extra wiring — but ECS task definitions and EKS
> pod specs do not get it for free. The ECS/EKS templates already pass it
> (`scripts/deploy.sh` sets it in the task definition; the Helm chart's
> `awsRegion` value feeds it into `deployment.yaml`) — if you fork the
> templates or roll your own deployment, keep that wiring or pass
> `region` explicitly to `createCedarAuth()`.

### Local development

```javascript
app.use(createCedarAuth({
  devMode: process.env.NODE_ENV !== 'production',
  devUser: { email: 'dev@example.com', sub: 'dev-001', groups: ['engineering'] },
}));
```

## Writing Cedar policies

Place `.cedar` files in the `cedar/` directory of your service repository.

When **no** `.cedar` files exist: all authenticated users are permitted (default).  
When **any** `.cedar` file exists: the default is disabled — only your explicit policies apply.

> **The `cedar/` directory must ship in the deployed artifact**, not just live
> in the repo. `initPolicies()` reads it relative to the running process's
> working directory at container/function start — if it's missing there, the
> app silently falls back to the default allow-all policy even though CI
> validated your custom policy successfully. The templates already handle
> this (`COPY cedar/ ./cedar/` in every Dockerfile; `zip -rqg function.zip
> cedar` in the native Lambda `deploy.sh`) — keep that step if you fork them.

### Examples

**Restrict to engineering group:**
```cedar
permit(
  principal in Prototype::Group::"engineering",
  action,
  resource
);
```

**Read-only for viewers, full access for admins:**
```cedar
permit(principal in Prototype::Group::"admin", action, resource);

permit(
  principal in Prototype::Group::"viewer",
  action in [Prototype::Action::"HttpGet"],
  resource
);
```

**Block DELETE for non-admins:**
```cedar
permit(principal is Prototype::User, action, resource);

forbid(
  principal,
  action == Prototype::Action::"HttpDelete",
  resource
) unless {
  principal in Prototype::Group::"admin"
};
```

### Available actions

- `Prototype::Action::"HttpGet"`
- `Prototype::Action::"HttpPost"`
- `Prototype::Action::"HttpPut"`
- `Prototype::Action::"HttpDelete"`
- `Prototype::Action::"HttpPatch"`

### Cognito groups

Users are assigned to groups via the AWS Cognito console or CLI. The group name in Cedar must match the Cognito group name exactly.

Platform provides two default groups:
- `admin` — platform administrators
- `engineering` — engineering team members

## Validating policies

Validate locally:

```bash
npx cedar-auth-validate --policy-dir ./cedar
```

CI validation runs automatically via the build workflow when `.cedar` files are present.

## Testing

Use `@prototype/cedar-auth/testing` to unit-test Cedar policies without a running server:

```typescript
import { testAuthorize } from '@prototype/cedar-auth/testing';

it('allows engineering group', async () => {
  const result = await testAuthorize({
    policies: ['./cedar/my-policy.cedar'],
    principal: { email: 'alice@example.com', sub: 'u1', groups: ['engineering'] },
    action: 'GET',
    resourcePath: '/api/data',
    serviceName: 'my-service',
  });
  expect(result.allowed).toBe(true);
});

it('denies unknown group', async () => {
  const result = await testAuthorize({
    policies: ['./cedar/my-policy.cedar'],
    principal: { email: 'bob@example.com', sub: 'u2', groups: [] },
    action: 'GET',
    resourcePath: '/api/data',
    serviceName: 'my-service',
  });
  expect(result.allowed).toBe(false);
});
```

## Publishing to internal registry

Requires an IAM identity with `codeartifact:PublishPackageVersion` on the
`prototype/npm` repository (an admin identity typically already has this via
broad IAM access; see the [root README](../../README.md#codeartifact-setup-internal-npm-registry)
for the repository's own IAM setup).

```bash
# Log in — writes registry + auth token into npm config for this shell
aws codeartifact login --tool npm \
  --domain prototype \
  --domain-owner <account_id> \
  --repository npm \
  --region <region>

# Build
npm run build

# Publish
npm publish
```

Bump `version` in `package.json` before publishing. Follow semver: breaking schema/API changes → major, new options → minor, fixes → patch.

After publishing, update template repos:
- `template-repo-ecs/package.json`
- `template-repo/package.json`
- `template-repo-lambda-web/package.json`
- `template-repo-lambda/package.json`

## Package development

```bash
# Install dependencies
npm install

# Build (outputs to dist/)
npm run build

# Type check only
npm run typecheck

# Run tests
npm test
```

Tests require no AWS credentials — JWT key fetching is injectable for hermetic tests.

## Cedar schema

Located at `cedar/schema.cedarschema`. Defines the entity model for the platform:

```
namespace Prototype {
  entity Group;
  entity User in [Group] { email: String, sub: String };
  entity Service { name: String };
  entity Endpoint in [Service] { path: String };
  action HttpGet, HttpPost, HttpPut, HttpDelete, HttpPatch appliesTo {
    principal: User,
    resource: Endpoint,
    context: { path: String, method: String, ip: String, serviceName: String },
  };
}
```

Schema changes require re-validation of all existing service policies. Run `cedar-auth-validate` across all service `cedar/` directories before releasing a schema change.
