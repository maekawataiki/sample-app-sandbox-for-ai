import { Command } from "commander";
import { loginCommand } from "./commands/login";
import { whoamiCommand } from "./commands/whoami";
import { initCommand } from "./commands/init";
import { destroyCommand } from "./commands/destroy";
import { runtimesCommand } from "./commands/runtimes";

const program = new Command();

program
  .name("prototype")
  .description("CLI for the prototype platform")
  .version("0.1.0");

program
  .command("login")
  .description("Authenticate via the configured identity provider")
  .action(async () => {
    await loginCommand();
  });

program
  .command("whoami")
  .description("Show the currently authenticated user")
  .action(async () => {
    await whoamiCommand();
  });

program
  .command("runtimes")
  .description("List the compute runtimes enabled on this platform")
  .action(async () => {
    await runtimesCommand();
  });

program
  .command("init <app-name>")
  .description("Provision a new prototype service (GitHub repo, ECR, Cognito callback URL)")
  .option("-r, --runtime <runtime>", "compute runtime (defaults to the platform's defaultRuntime)")
  .action(async (appName: string, opts: { runtime?: string }) => {
    await initCommand(appName, opts);
  });

program
  .command("destroy <app-name>")
  .description("Tear down a prototype service (Helm release, Cognito URL, ECR, GitHub repo)")
  .option("-y, --yes", "skip the confirmation prompt")
  .option("--keep-repo", "do not delete the GitHub repository")
  .action(async (appName: string, opts) => {
    await destroyCommand(appName, opts);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
