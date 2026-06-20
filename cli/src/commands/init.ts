import { spawnSync } from "child_process";
import ora from "ora";
import pc from "picocolors";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  PutLifecyclePolicyCommand,
  SetRepositoryPolicyCommand,
} from "@aws-sdk/client-ecr";
import { Octokit } from "@octokit/rest";
import { loadConfig, resolveRuntime, RuntimeConfig } from "../config";

// Constraints satisfied:
//   - RFC 1123 label (k8s namespace, DNS subdomain): lowercase, no consecutive hyphens, no leading/trailing hyphen
//   - ECR repository path component: lowercase alnum + hyphen
//   - 3-40 chars total
export const NAME_RE = /^(?!.*--)[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

export function githubToken(): string {
  // Prefer `gh auth token` (has full repo scope) over GITHUB_TOKEN env var
  // which may be a limited-scope token injected by CI or other tools.
  const result = spawnSync("gh", ["auth", "token"], { stdio: ["pipe", "pipe", "pipe"] });
  if (result.status === 0) {
    const out = result.stdout?.toString().trim() ?? "";
    if (out) return out;
  }
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  throw new Error("GitHub token not found. Run `gh auth login` or set GITHUB_TOKEN.");
}

export function requireField<T>(value: T | undefined, name: string): T {
  if (!value) throw new Error(`${name} is not configured. Add it to ~/.config/prototype/config.json or set the env var.`);
  return value;
}

export function callbackUrlFor(host: string): string {
  return `https://${host}/oauth2/idpresponse`;
}

export function logoutUrlFor(host: string): string {
  return `https://${host}/logout`;
}

// GitHub repo name follows a `prototype-<app>` convention so the OIDC trust
// policy can scope ECR-push to repos created by this platform only.
export function githubRepoFor(appName: string): string {
  return `prototype-${appName}`;
}

async function describeClient(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  clientId: string,
) {
  const { UserPoolClient: c } = await client.send(
    new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: clientId }),
  );
  if (!c) throw new Error("Cognito client not found");
  return c;
}

async function updateClientUrls(
  client: CognitoIdentityProviderClient,
  c: Awaited<ReturnType<typeof describeClient>>,
  userPoolId: string,
  clientId: string,
  callbacks: string[],
  logouts: string[],
): Promise<void> {
  await client.send(new UpdateUserPoolClientCommand({
    UserPoolId:                         userPoolId,
    ClientId:                           clientId,
    ClientName:                         c.ClientName,
    AllowedOAuthFlows:                  c.AllowedOAuthFlows,
    AllowedOAuthFlowsUserPoolClient:    c.AllowedOAuthFlowsUserPoolClient,
    AllowedOAuthScopes:                 c.AllowedOAuthScopes,
    SupportedIdentityProviders:         c.SupportedIdentityProviders,
    CallbackURLs:                       callbacks,
    LogoutURLs:                         logouts,
    ExplicitAuthFlows:                  c.ExplicitAuthFlows,
    AccessTokenValidity:                c.AccessTokenValidity,
    IdTokenValidity:                    c.IdTokenValidity,
    RefreshTokenValidity:               c.RefreshTokenValidity,
    TokenValidityUnits:                 c.TokenValidityUnits,
    PreventUserExistenceErrors:         c.PreventUserExistenceErrors,
  }));
}

export async function appendCognitoCallback(
  region: string,
  userPoolId: string,
  clientId: string,
  callbackUrl: string,
  logoutUrl: string,
): Promise<{ added: boolean }> {
  const client = new CognitoIdentityProviderClient({ region });
  const c = await describeClient(client, userPoolId, clientId);

  const existing = new Set(c.CallbackURLs ?? []);
  if (existing.has(callbackUrl)) return { added: false };

  const callbacks = [...existing, callbackUrl];
  const logouts   = [...new Set([...(c.LogoutURLs ?? []), logoutUrl])];

  if (callbacks.length > 95) {
    throw new Error(`Cognito callback URL limit approaching (${callbacks.length}/100). Run \`prototype destroy\` for unused services.`);
  }

  await updateClientUrls(client, c, userPoolId, clientId, callbacks, logouts);
  return { added: true };
}

export async function removeCognitoCallback(
  region: string,
  userPoolId: string,
  clientId: string,
  callbackUrl: string,
  logoutUrl: string,
): Promise<{ removed: boolean }> {
  const client = new CognitoIdentityProviderClient({ region });
  const c = await describeClient(client, userPoolId, clientId);

  const callbacks = (c.CallbackURLs ?? []).filter(u => u !== callbackUrl);
  const logouts   = (c.LogoutURLs   ?? []).filter(u => u !== logoutUrl);

  if (callbacks.length === (c.CallbackURLs ?? []).length &&
      logouts.length   === (c.LogoutURLs   ?? []).length) {
    return { removed: false };
  }

  // Cognito requires at least one callback URL when OAuth flows are enabled.
  if (callbacks.length === 0) {
    throw new Error(`Refusing to remove the last Cognito callback URL on client ${clientId}.`);
  }

  await updateClientUrls(client, c, userPoolId, clientId, callbacks, logouts);
  return { removed: true };
}

async function ecrRepoExists(ecr: ECRClient, repoName: string): Promise<boolean> {
  try {
    await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [repoName] }));
    return true;
  } catch (e: any) {
    if (e.name === "RepositoryNotFoundException") return false;
    throw e;
  }
}

export async function ensureEcrRepo(
  region: string,
  name: string,
  opts: { lambdaPull?: { accountId: string } } = {},
): Promise<{ created: boolean; repositoryName: string }> {
  const ecr = new ECRClient({ region });
  const repoName = `prototype/${name}`;
  const created = !(await ecrRepoExists(ecr, repoName));

  if (created) {
    await ecr.send(new CreateRepositoryCommand({
      repositoryName: repoName,
      imageScanningConfiguration: { scanOnPush: true },
    }));

    await ecr.send(new PutLifecyclePolicyCommand({
      repositoryName: repoName,
      lifecyclePolicyText: JSON.stringify({
        rules: [{
          rulePriority: 1,
          description: "Keep last 10 images",
          selection: { tagStatus: "any", countType: "imageCountMoreThan", countNumber: 10 },
          action: { type: "expire" },
        }],
      }),
    }));
  }

  // Container-image Lambda needs the Lambda service principal to be able to pull
  // from the repo (the function's execution role does NOT grant this — the pull
  // happens before the role is assumed). The console wires this up automatically;
  // CreateFunction via API doesn't. Scoped to prototype-* functions in this
  // account/region so the policy is reusable across services without widening.
  if (opts.lambdaPull) {
    await ecr.send(new SetRepositoryPolicyCommand({
      repositoryName: repoName,
      policyText: JSON.stringify({
        Version: "2008-10-17",
        Statement: [{
          Sid: "LambdaECRImageRetrievalPolicy",
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
          Condition: {
            StringLike: {
              "aws:sourceArn": `arn:aws:lambda:${region}:${opts.lambdaPull.accountId}:function:prototype-*`,
            },
          },
        }],
      }),
    }));
  }

  return { created, repositoryName: repoName };
}

async function waitForRepoReady(
  octokit: Octokit,
  org: string,
  repo: string,
  maxMs = 30000,
): Promise<void> {
  const deadline = Date.now() + maxMs;
  let delay = 500;
  while (Date.now() < deadline) {
    try {
      const { data } = await octokit.rest.repos.get({ owner: org, repo });
      if (data.id) return;
    } catch {
      // ignore — repo not visible yet
    }
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 2000);
  }
  throw new Error(`GitHub repo ${org}/${repo} not ready after ${maxMs}ms`);
}

async function repoExists(octokit: Octokit, org: string, name: string): Promise<boolean> {
  try {
    await octokit.rest.repos.get({ owner: org, repo: name });
    return true;
  } catch (e: any) {
    if (e.status === 404) return false;
    throw e;
  }
}

async function createRepoFromTemplate(
  octokit: Octokit,
  org: string,
  templateRepo: string,
  name: string,
): Promise<string> {
  const { data } = await (octokit.rest.repos.createUsingTemplate as any)({
    template_owner: org,
    template_repo: templateRepo,
    owner: org,
    name,
    private: true,
    include_all_branches: false,
  });
  return data.html_url as string;
}

async function setRepoVariable(
  octokit: Octokit,
  org: string,
  repo: string,
  name: string,
  value: string,
): Promise<void> {
  // A repo created from a template is eventually consistent: for a short window
  // after creation its Actions variables API returns 500/404 even though the
  // repo already exists. Retry with backoff to ride that out.
  let delay = 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      await octokit.rest.actions.createRepoVariable({ owner: org, repo, name, value });
      return;
    } catch (e: any) {
      if (e.status === 409) {
        await octokit.rest.actions.updateRepoVariable({ owner: org, repo, name, value });
        return;
      }
      if ((e.status === 500 || e.status === 404) && attempt < 5) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 8000);
        continue;
      }
      throw e;
    }
  }
}

interface Rollback {
  label: string;
  fn: () => Promise<void>;
}

async function runRollback(actions: Rollback[]): Promise<void> {
  // Reverse order: undo most recent action first.
  for (const action of actions.slice().reverse()) {
    try {
      console.log(pc.dim(`  rolling back: ${action.label}`));
      await action.fn();
    } catch (e: any) {
      console.error(pc.yellow(`  rollback failed (${action.label}): ${e.message ?? e}`));
    }
  }
}

export async function initCommand(
  appName: string,
  opts: { runtime?: string } = {},
): Promise<void> {
  if (!NAME_RE.test(appName)) {
    console.error(pc.red(
      `Invalid app name "${appName}". 3-40 chars, lowercase letters/digits/hyphens, ` +
      `must start with a letter, end with a letter or digit, no consecutive hyphens.`,
    ));
    process.exit(1);
  }

  const cfg = loadConfig();
  let runtime: string, rc: RuntimeConfig;
  try {
    ({ runtime, rc } = resolveRuntime(cfg, opts.runtime));
  } catch (e: any) {
    console.error(pc.red(e.message ?? String(e)));
    process.exit(1);
  }
  // Cluster runtimes (ecs/eks) deploy into a cluster; the rest ride the ALB and
  // need its name. Validate the right field is present for the chosen runtime.
  const needsCluster = runtime === "ecs" || runtime === "eks";
  if (needsCluster && !rc.clusterName) {
    console.error(pc.red(`Runtime "${runtime}" requires a clusterName in config.runtimes.${runtime}.`));
    process.exit(1);
  }
  if (!needsCluster && !rc.albName) {
    console.error(pc.red(`Runtime "${runtime}" requires an albName in config.runtimes.${runtime}.`));
    process.exit(1);
  }

  const region           = requireField(cfg.awsRegion,            "awsRegion / AWS_REGION");
  const accountId        = requireField(cfg.awsAccountId,         "awsAccountId / AWS_ACCOUNT_ID");
  const baseDomain       = requireField(cfg.baseDomain,           "baseDomain / PROTOTYPE_BASE_DOMAIN");
  const githubOrg        = requireField(cfg.githubOrg,            "githubOrg / GITHUB_ORG");
  const templateRepo     = rc.templateRepo;
  const userPoolId       = requireField(cfg.cognitoUserPoolId,    "cognitoUserPoolId / COGNITO_USER_POOL_ID");
  const albClientId      = requireField(cfg.cognitoAlbClientId,   "cognitoAlbClientId / COGNITO_ALB_CLIENT_ID");
  const userPoolArn      = requireField(cfg.cognitoUserPoolArn,   "cognitoUserPoolArn / COGNITO_USER_POOL_ARN");
  const userPoolDomain   = requireField(cfg.cognitoUserPoolDomain,"cognitoUserPoolDomain / COGNITO_USER_POOL_DOMAIN");
  const certArn          = requireField(cfg.acmCertificateArn,    "acmCertificateArn / ACM_CERTIFICATE_ARN");

  const token   = githubToken();
  const octokit = new Octokit({ auth: token });
  const host    = `${appName}.${baseDomain}`;
  const repoSlug    = githubRepoFor(appName);
  const callbackUrl = callbackUrlFor(host);
  const logoutUrl   = logoutUrlFor(host);

  console.log("");
  console.log(pc.bold(`Provisioning ${pc.cyan(appName)} ${pc.dim(`(runtime: ${runtime})`)}...`));
  console.log(pc.dim(`  URL will be: https://${host}`));
  console.log("");

  // Pre-flight: fail fast on conflicts before mutating anything.
  const spinPre = ora({ color: "cyan" }).start("Pre-flight checks");
  if (await repoExists(octokit, githubOrg, repoSlug)) {
    spinPre.fail(`GitHub repo ${githubOrg}/${repoSlug} already exists. Use a different name or run \`prototype destroy ${appName}\` first.`);
    process.exit(1);
  }
  spinPre.succeed("Pre-flight checks passed");

  const rollback: Rollback[] = [];
  const spin = ora({ color: "cyan" });

  try {
    // 1. Cognito
    spin.start("Registering Cognito callback URL");
    const cognito = await appendCognitoCallback(region, userPoolId, albClientId, callbackUrl, logoutUrl);
    if (cognito.added) {
      rollback.push({
        label: "remove Cognito callback URL",
        fn: () => removeCognitoCallback(region, userPoolId, albClientId, callbackUrl, logoutUrl).then(() => undefined),
      });
    }
    spin.succeed(cognito.added ? "Cognito callback URL registered" : "Cognito callback URL already present");

    // 2. GitHub repo
    spin.start(`Creating GitHub repo ${githubOrg}/${repoSlug} from template`);
    const repoUrl = await createRepoFromTemplate(octokit, githubOrg, templateRepo, repoSlug);
    rollback.push({
      label: `delete GitHub repo ${githubOrg}/${repoSlug}`,
      fn: async () => { await octokit.rest.repos.delete({ owner: githubOrg, repo: repoSlug }); },
    });
    spin.succeed(`GitHub repo created: ${repoUrl}`);

    // Poll until GitHub finishes initialising the repo (template copy is
    // async; createRepoVariable can 404 immediately after creation).
    await waitForRepoReady(octokit, githubOrg, repoSlug);

    // 3. GitHub Actions variables — a shared set plus runtime-specific ones.
    // RUNTIME is always set so `destroy` can tear down the right way later.
    spin.start("Setting GitHub Actions variables");
    const vars: Array<[string, string]> = [
      ["SERVICE_NAME",             appName],
      ["AWS_ACCOUNT_ID",           accountId],
      ["AWS_REGION",               region],
      ["INGRESS_HOST",             host],
      ["ACM_CERTIFICATE_ARN",      certArn],
      ["COGNITO_USER_POOL_ARN",    userPoolArn],
      ["COGNITO_CLIENT_ID",        albClientId],
      ["COGNITO_USER_POOL_DOMAIN", userPoolDomain],
      ["RUNTIME",                  runtime],
      // Deploy role ARN — explicit so a suffixed role name flows to the pipeline.
      // The default matches the EKS base stack's un-suffixed role name; ECS and
      // Lambda runtimes always supply rc.deployRoleArn from their TF outputs.
      ["DEPLOY_ROLE_ARN", rc.deployRoleArn ?? `arn:aws:iam::${accountId}:role/github-actions-prototype`],
    ];
    if (rc.clusterName) vars.push(["CLUSTER_NAME", rc.clusterName]);
    if (rc.albName)     vars.push(["ALB_NAME", rc.albName]);
    if (rc.needsEcr)    vars.push(["ECR_REPOSITORY", `prototype/${appName}`]);
    await Promise.all(vars.map(([k, v]) => setRepoVariable(octokit, githubOrg, repoSlug, k, v)));
    spin.succeed("GitHub Actions variables set");

    // 4. ECR — container runtimes only. For lambda-web (container-image Lambda)
    // the repo also needs a policy letting the Lambda service pull the image.
    if (rc.needsEcr) {
      spin.start(`Ensuring ECR repository prototype/${appName}`);
      const ecr = await ensureEcrRepo(region, appName,
        runtime === "lambda-web" ? { lambdaPull: { accountId } } : {});
      spin.succeed(ecr.created ? `ECR repository created: ${ecr.repositoryName}` : `ECR repository already existed: ${ecr.repositoryName}`);
    }

    console.log("");
    console.log(pc.green("Done!"));
    console.log("");
    console.log(pc.bold("Next steps:"));
    console.log(`  1. Clone:  ${pc.cyan(`git clone ${repoUrl}`)}`);
    console.log(`  2. Push to main to trigger the first build & deploy`);
    console.log(`  3. Live at: ${pc.cyan(`https://${host}`)}  (ready ~3 min after push)`);
    console.log("");
  } catch (err: any) {
    spin.fail(`Provisioning failed: ${err.message ?? err}`);
    if (rollback.length > 0) {
      console.log(pc.yellow(`Rolling back ${rollback.length} step(s)...`));
      await runRollback(rollback);
    }
    process.exit(1);
  }
}
