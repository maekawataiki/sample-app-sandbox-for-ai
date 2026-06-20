import fs from "fs";
import path from "path";
import os from "os";

export interface Credentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
}

export type AuthProvider = "cognito" | "okta";

// Compute backends the platform can target. Which ones are actually available
// in a given deployment is declared by the admin in `config.runtimes`.
//   eks / ecs   — containers in a cluster
//   lambda      — native handler (event-driven / batch)
//   lambda-web  — Lambda Web Adapter (web/API app, container image)
export type Runtime = "eks" | "ecs" | "lambda" | "lambda-web";

export interface RuntimeConfig {
  // GitHub template repo the service is created from (ships the deploy pipeline
  // for this runtime).
  templateRepo: string;
  // ecs/eks only — the cluster `init` wires into Actions variables and
  // `destroy` tears down against. Omitted for Lambda.
  clusterName?: string;
  // Name of the shared ALB used to find listener rules during teardown. For
  // ecs/eks this equals clusterName; for Lambda it is set explicitly (there is
  // no cluster). Passed to the deploy pipeline as the ALB_NAME variable.
  albName?: string;
  // Whether `init` should provision an ECR repository for the service. True for
  // container runtimes (ecs/eks, lambda-web); false for zip Lambda.
  needsEcr: boolean;
  // ARN of the GitHub Actions deploy role passed to the service pipeline as the
  // DEPLOY_ROLE_ARN variable. Lets the role name carry a deployment suffix.
  // Defaults to arn:aws:iam::<account>:role/github-actions-prototype (the EKS
  // base stack's un-suffixed deploy role name).
  deployRoleArn?: string;
}

export interface Config {
  apiBaseUrl: string;
  authProvider: AuthProvider;
  authIssuer: string;
  authClientId: string;
  // Cognito-only:
  cognitoDomain?: string;
  callbackPort?: number;
  // Platform provisioning (shared across all runtimes):
  awsRegion?: string;
  awsAccountId?: string;
  baseDomain?: string;
  githubOrg?: string;
  gitopsRepo?: string;
  cognitoUserPoolId?: string;
  cognitoAlbClientId?: string;
  cognitoUserPoolArn?: string;
  cognitoUserPoolDomain?: string;
  acmCertificateArn?: string;
  // Runtime selection:
  defaultRuntime?: Runtime;
  runtimes?: Partial<Record<Runtime, RuntimeConfig>>;
  // Legacy flat fields — kept for backward compatibility with pre-multi-runtime
  // config.json files. Folded into `runtimes.eks` by loadConfig() when no
  // `runtimes` block is present. Prefer the `runtimes` block in new configs.
  clusterName?: string;
  githubTemplateRepo?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "prototype");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function detectProvider(): AuthProvider {
  const v = (process.env.AUTH_PROVIDER ?? "cognito").toLowerCase();
  if (v === "okta" || v === "cognito") return v;
  throw new Error(`AUTH_PROVIDER must be 'cognito' or 'okta' (got '${v}')`);
}

const DEFAULT_CONFIG: Config = {
  apiBaseUrl: process.env.PROTOTYPE_API_URL ?? "",
  authProvider: detectProvider(),
  authIssuer: process.env.AUTH_ISSUER ?? "",
  authClientId: process.env.AUTH_CLIENT_ID ?? "",
  cognitoDomain: process.env.COGNITO_DOMAIN,
  callbackPort: process.env.CALLBACK_PORT ? parseInt(process.env.CALLBACK_PORT, 10) : 8765,
  awsRegion: process.env.AWS_REGION ?? "ap-northeast-1",
  awsAccountId: process.env.AWS_ACCOUNT_ID,
  baseDomain: process.env.PROTOTYPE_BASE_DOMAIN,
  clusterName: process.env.CLUSTER_NAME,
  githubOrg: process.env.GITHUB_ORG,
  githubTemplateRepo: process.env.GITHUB_TEMPLATE_REPO ?? "eks-prototype-template",
  gitopsRepo: process.env.GITOPS_REPO ?? "eks-prototype-gitops",
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
  cognitoAlbClientId: process.env.COGNITO_ALB_CLIENT_ID,
  cognitoUserPoolArn: process.env.COGNITO_USER_POOL_ARN,
  cognitoUserPoolDomain: process.env.COGNITO_USER_POOL_DOMAIN,
  acmCertificateArn: process.env.ACM_CERTIFICATE_ARN,
};

function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function loadConfig(): Config {
  let cfg: Config = DEFAULT_CONFIG;
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    cfg = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  }
  return foldLegacyRuntime(cfg);
}

// Pre-multi-runtime configs only described EKS, via the flat `clusterName` /
// `githubTemplateRepo` fields. Synthesize an equivalent `runtimes.eks` entry so
// those configs keep working unchanged.
function foldLegacyRuntime(cfg: Config): Config {
  if (cfg.runtimes && Object.keys(cfg.runtimes).length > 0) return cfg;
  return {
    ...cfg,
    defaultRuntime: cfg.defaultRuntime ?? "eks",
    runtimes: {
      eks: {
        templateRepo: cfg.githubTemplateRepo ?? "eks-prototype-template",
        clusterName: cfg.clusterName,
        needsEcr: true,
      },
    },
  };
}

export function listRuntimes(cfg: Config): Runtime[] {
  return Object.keys(cfg.runtimes ?? {}) as Runtime[];
}

// Resolve which runtime a command should target: explicit flag wins, else the
// admin-configured default. Throws with the available menu on any mismatch so
// the error message and the menu share a single source of truth (`runtimes`).
export function resolveRuntime(
  cfg: Config,
  flag?: string,
): { runtime: Runtime; rc: RuntimeConfig } {
  const available = listRuntimes(cfg);
  if (available.length === 0) {
    throw new Error("No runtimes configured. Add a `runtimes` block to ~/.config/prototype/config.json.");
  }
  const chosen = (flag ?? cfg.defaultRuntime) as Runtime | undefined;
  if (!chosen) {
    throw new Error(`No runtime specified and no defaultRuntime set. Use --runtime <${available.join("|")}>.`);
  }
  const rc = cfg.runtimes?.[chosen];
  if (!rc) {
    throw new Error(`Runtime "${chosen}" is not enabled on this platform. Available: ${available.join(", ")}.`);
  }
  return { runtime: chosen, rc };
}

export function saveCredentials(creds: Credentials): void {
  ensureConfigDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
  // Guarantee 0600 — the `mode` arg above is masked by the process umask on
  // some systems and the file may also pre-exist with looser permissions.
  fs.chmodSync(CREDENTIALS_FILE, 0o600);
}

export function loadCredentials(): Credentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;
  const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
  return JSON.parse(raw);
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
  }
}
