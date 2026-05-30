import pc from "picocolors";
import { loadConfig, saveCredentials } from "../config";
import { login } from "../auth";

export async function loginCommand(): Promise<void> {
  const config = loadConfig();
  console.log(pc.bold(`Logging in via ${config.authProvider}...`));

  const creds = await login(config);
  saveCredentials(creds);

  console.log("");
  console.log(pc.green("Logged in successfully"));
  if (creds.email) {
    console.log(pc.dim(`  Account: ${creds.email}`));
  }
  console.log(pc.dim(`  Expires: ${new Date(creds.expiresAt).toLocaleString()}`));
}
