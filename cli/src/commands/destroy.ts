import { spawnSync } from "child_process";
import readline from "readline";
import ora from "ora";
import pc from "picocolors";
import {
  ECRClient,
  DeleteRepositoryCommand,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";
import { Octokit } from "@octokit/rest";
import { loadConfig, Runtime } from "../config";
import { teardownEcsService } from "../aws/ecs";
import { teardownLambdaService } from "../aws/lambda";
import {
  NAME_RE,
  callbackUrlFor,
  githubRepoFor,
  githubToken,
  logoutUrlFor,
  removeCognitoCallback,
  requireField,
} from "./init";

interface DestroyOptions {
  yes?: boolean;
  keepRepo?: boolean;
}

function which(cmd: string): boolean {
  return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
}

function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} [y/N] `, ans => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function helmUninstall(release: string, namespace: string, region: string, cluster: string): Promise<boolean> {
  if (!which("helm") || !which("aws")) {
    console.log(pc.yellow("  helm and aws CLIs are required to remove the in-cluster release; skipping."));
    return false;
  }
  const kubeconfig = spawnSync(
    "aws",
    ["eks", "update-kubeconfig", "--name", cluster, "--region", region],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  if (kubeconfig.status !== 0) {
    const stderr = kubeconfig.stderr?.toString().trim() ?? "unknown error";
    console.log(pc.yellow(`  could not update kubeconfig: ${stderr}`));
    return false;
  }
  const status = spawnSync("helm", ["status", release, "-n", namespace], { stdio: "ignore" }).status;
  if (status !== 0) {
    return false;
  }
  const result = spawnSync("helm", ["uninstall", release, "-n", namespace, "--wait"], { stdio: "inherit" });
  return result.status === 0;
}

async function deleteEcrRepo(region: string, repoName: string): Promise<boolean> {
  const ecr = new ECRClient({ region });
  try {
    await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [repoName] }));
  } catch (e: any) {
    if (e.name === "RepositoryNotFoundException") return false;
    throw e;
  }
  await ecr.send(new DeleteRepositoryCommand({ repositoryName: repoName, force: true }));
  return true;
}

async function deleteGithubRepo(octokit: Octokit, org: string, repo: string): Promise<boolean> {
  try {
    await octokit.rest.repos.delete({ owner: org, repo });
    return true;
  } catch (e: any) {
    if (e.status === 404) return false;
    throw e;
  }
}

// `init` stamps the chosen runtime onto the service repo as the RUNTIME Actions
// variable. Read it back so teardown matches the way the service was deployed.
async function readRuntimeVar(octokit: Octokit, org: string, repo: string): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.actions.getRepoVariable({ owner: org, repo, name: "RUNTIME" });
    return data.value;
  } catch (e: any) {
    if (e.status === 404) return undefined;
    throw e;
  }
}

export async function destroyCommand(appName: string, opts: DestroyOptions): Promise<void> {
  if (!NAME_RE.test(appName)) {
    console.error(pc.red(`Invalid app name "${appName}".`));
    process.exit(1);
  }

  const cfg = loadConfig();
  const region          = requireField(cfg.awsRegion,             "awsRegion / AWS_REGION");
  const baseDomain      = requireField(cfg.baseDomain,            "baseDomain / PROTOTYPE_BASE_DOMAIN");
  const githubOrg       = requireField(cfg.githubOrg,             "githubOrg / GITHUB_ORG");
  const userPoolId      = requireField(cfg.cognitoUserPoolId,     "cognitoUserPoolId / COGNITO_USER_POOL_ID");
  const albClientId     = requireField(cfg.cognitoAlbClientId,    "cognitoAlbClientId / COGNITO_ALB_CLIENT_ID");

  const host        = `${appName}.${baseDomain}`;
  const callbackUrl = callbackUrlFor(host);
  const logoutUrl   = logoutUrlFor(host);
  const repoName    = `prototype/${appName}`;
  const repoSlug    = githubRepoFor(appName);

  // Resolve the runtime the service was deployed with (stamped on the repo at
  // init time). The same GitHub client is reused for the repo deletion below.
  let octokit: Octokit | undefined;
  try { octokit = new Octokit({ auth: githubToken() }); } catch { /* token optional for the read */ }
  let runtime: Runtime = cfg.defaultRuntime ?? "eks";
  if (octokit) {
    const v = await readRuntimeVar(octokit, githubOrg, repoSlug);
    if (v) runtime = v as Runtime;
  }
  const clusterName = cfg.runtimes?.[runtime]?.clusterName;

  console.log("");
  console.log(pc.bold(`Destroying ${pc.cyan(appName)}`));
  console.log(pc.dim(`  Runtime:              ${runtime}`));
  console.log(pc.dim(`  Cognito callback URL: ${callbackUrl}`));
  console.log(pc.dim(`  ECR repository:       ${repoName}`));
  console.log(pc.dim(`  Deployment:           ${appName} (${runtime})`));
  if (!opts.keepRepo) {
    console.log(pc.dim(`  GitHub repo:          ${githubOrg}/${repoSlug}`));
  }
  console.log("");

  if (!opts.yes) {
    const ok = await confirm(pc.yellow(`This will permanently delete the resources above. Continue?`));
    if (!ok) {
      console.log("Aborted.");
      process.exit(1);
    }
  }

  const errors: string[] = [];
  const spin = ora({ color: "cyan" });

  // 1. Compute teardown (before ECR delete so nothing pulls images mid-drain).
  spin.start("Removing deployment");
  try {
    if (runtime === "eks") {
      if (!clusterName) throw new Error(`clusterName not configured for runtime "${runtime}"`);
      const removed = await helmUninstall(appName, "prototype", region, clusterName);
      spin.succeed(removed ? "Helm release removed" : "Helm release not found (skipped)");
    } else if (runtime === "ecs") {
      if (!clusterName) throw new Error(`clusterName not configured for runtime "${runtime}"`);
      const removed = await teardownEcsService(region, clusterName, appName, host);
      spin.succeed(removed ? "ECS service & ALB rule removed" : "ECS service not found (skipped)");
    } else if (runtime === "lambda" || runtime === "lambda-web") {
      const albName = cfg.runtimes?.[runtime]?.albName;
      if (!albName) throw new Error(`albName not configured for runtime "${runtime}"`);
      const removed = await teardownLambdaService(region, albName, `prototype-${appName}`, host);
      spin.succeed(removed ? "Lambda function & ALB rule removed" : "Lambda function not found (skipped)");
    } else {
      spin.warn(`Compute teardown for runtime "${runtime}" is not automated; remove it manually.`);
    }
  } catch (e: any) {
    spin.fail(`Deployment teardown failed: ${e.message ?? e}`);
    errors.push("deploy");
  }

  // 2. Cognito callback URL
  spin.start("Removing Cognito callback URL");
  try {
    const result = await removeCognitoCallback(region, userPoolId, albClientId, callbackUrl, logoutUrl);
    spin.succeed(result.removed ? "Cognito callback URL removed" : "Cognito callback URL not found (skipped)");
  } catch (e: any) {
    spin.fail(`Cognito cleanup failed: ${e.message ?? e}`);
    errors.push("cognito");
  }

  // 3. ECR repository
  spin.start(`Deleting ECR repository ${repoName}`);
  try {
    const removed = await deleteEcrRepo(region, repoName);
    spin.succeed(removed ? `ECR repository deleted: ${repoName}` : "ECR repository not found (skipped)");
  } catch (e: any) {
    spin.fail(`ECR delete failed: ${e.message ?? e}`);
    errors.push("ecr");
  }

  // 4. GitHub repo
  if (!opts.keepRepo) {
    spin.start(`Deleting GitHub repo ${githubOrg}/${repoSlug}`);
    try {
      const gh = octokit ?? new Octokit({ auth: githubToken() });
      const removed = await deleteGithubRepo(gh, githubOrg, repoSlug);
      spin.succeed(removed ? `GitHub repo deleted: ${githubOrg}/${repoSlug}` : "GitHub repo not found (skipped)");
    } catch (e: any) {
      spin.fail(`GitHub repo delete failed: ${e.message ?? e}`);
      errors.push("github");
    }
  }

  console.log("");
  if (errors.length > 0) {
    console.log(pc.red(`Completed with errors in: ${errors.join(", ")}`));
    process.exit(1);
  }
  console.log(pc.green(`Done. ${appName} is gone.`));
}
