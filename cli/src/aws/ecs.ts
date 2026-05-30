import {
  ECSClient,
  UpdateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
} from "@aws-sdk/client-ecs";
import { deleteListenerRuleByHost, deleteTargetGroups } from "./alb";

// Tear down a single ECS-on-Fargate service and its slice of the shared ALB.
// The shared ALB is named after the cluster (see terraform/ecs-prototype), so
// the cluster name doubles as the ALB name for rule lookup.
export async function teardownEcsService(
  region: string,
  cluster: string,
  serviceName: string,
  host: string,
): Promise<boolean> {
  let removed = false;

  // 1. Listener rule + the target group(s) it forwards to, matched by host.
  const tgArns = await deleteListenerRuleByHost(region, cluster, host);
  if (tgArns.length > 0) removed = true;

  // 2. ECS service — scale to zero then force-delete.
  const ecs = new ECSClient({ region });
  try {
    const { services } = await ecs.send(
      new DescribeServicesCommand({ cluster, services: [serviceName] }),
    );
    const svc = services?.find(s => s.status !== "INACTIVE");
    if (svc) {
      await ecs.send(new UpdateServiceCommand({ cluster, service: serviceName, desiredCount: 0 }));
      await ecs.send(new DeleteServiceCommand({ cluster, service: serviceName, force: true }));
      removed = true;
    }
  } catch (e: any) {
    if (e.name !== "ClusterNotFoundException" && e.name !== "ServiceNotFoundException") throw e;
  }

  // 3. Target group(s) — detached from the listener by step 1.
  await deleteTargetGroups(region, tgArns);
  return removed;
}
