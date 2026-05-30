import pc from "picocolors";
import { loadConfig } from "../config";
import { ensureValidCredentials } from "../auth";

export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();
  try {
    const creds = await ensureValidCredentials(config);
    console.log(pc.bold("Account:"), creds.email ?? "(unknown)");
    console.log(pc.bold("Expires:"), new Date(creds.expiresAt).toLocaleString());
  } catch (e: any) {
    console.log(pc.yellow(e.message ?? String(e)));
    process.exit(1);
  }
}
