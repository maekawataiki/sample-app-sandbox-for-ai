import {
  LambdaClient,
  GetFunctionCommand,
  DeleteFunctionCommand,
} from "@aws-sdk/client-lambda";
import { deleteListenerRuleByHost, deleteTargetGroups } from "./alb";

// Tear down a single Lambda service and its slice of the shared ALB. The
// function is named `prototype-<app>` (see template-repo-lambda/scripts/deploy.sh).
export async function teardownLambdaService(
  region: string,
  albName: string,
  functionName: string,
  host: string,
): Promise<boolean> {
  let removed = false;

  // 1. Listener rule + the (lambda) target group it forwards to, matched by host.
  const tgArns = await deleteListenerRuleByHost(region, albName, host);
  if (tgArns.length > 0) removed = true;

  // 2. The function itself.
  const lambda = new LambdaClient({ region });
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    removed = true;
  } catch (e: any) {
    if (e.name !== "ResourceNotFoundException") throw e;
  }

  // 3. Target group — detached from the listener by step 1.
  await deleteTargetGroups(region, tgArns);
  return removed;
}
