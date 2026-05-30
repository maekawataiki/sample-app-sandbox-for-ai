import pc from "picocolors";
import { loadConfig, listRuntimes } from "../config";

// Show which compute runtimes the admin enabled on this platform, and which is
// the default. This is the discoverable counterpart to `init --runtime`.
export async function runtimesCommand(): Promise<void> {
  const cfg = loadConfig();
  const available = listRuntimes(cfg);
  if (available.length === 0) {
    console.log(pc.yellow("No runtimes configured. Add a `runtimes` block to ~/.config/prototype/config.json."));
    return;
  }

  console.log(pc.bold("Available runtimes:"));
  for (const r of available) {
    const rc = cfg.runtimes![r]!;
    const tag = r === cfg.defaultRuntime ? pc.green(" (default)") : "";
    const cluster = rc.clusterName ? `cluster=${rc.clusterName}` : "no cluster";
    const ecr = rc.needsEcr ? "ECR" : "no ECR";
    console.log(`  ${pc.cyan(r)}${tag}  ${pc.dim(`${rc.templateRepo} · ${cluster} · ${ecr}`)}`);
  }
  console.log("");
  console.log(pc.dim(`Use: prototype init <app> --runtime <${available.join("|")}>`));
}
