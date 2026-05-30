import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeListenersCommand,
  DescribeRulesCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

// Delete the listener rule whose host-header matches `host` on the named ALB's
// HTTPS listener, returning the target-group ARNs it forwarded to (so the caller
// can delete them after detaching the compute). Matching by host — which is
// unique per service — rather than by name keeps this robust to the 32-char ALB
// resource-name limit. Safe when the ALB / rule does not exist.
export async function deleteListenerRuleByHost(
  region: string,
  albName: string,
  host: string,
): Promise<string[]> {
  const elb = new ElasticLoadBalancingV2Client({ region });
  const tgArns: string[] = [];
  try {
    const { LoadBalancers } = await elb.send(new DescribeLoadBalancersCommand({ Names: [albName] }));
    const lbArn = LoadBalancers?.[0]?.LoadBalancerArn;
    if (!lbArn) return tgArns;
    const { Listeners } = await elb.send(new DescribeListenersCommand({ LoadBalancerArn: lbArn }));
    const https = Listeners?.find(l => l.Port === 443) ?? Listeners?.[0];
    if (!https?.ListenerArn) return tgArns;
    const { Rules } = await elb.send(new DescribeRulesCommand({ ListenerArn: https.ListenerArn }));
    for (const rule of Rules ?? []) {
      if (rule.IsDefault) continue;
      const matchesHost = (rule.Conditions ?? []).some(c =>
        c.Field === "host-header" &&
        (c.HostHeaderConfig?.Values ?? c.Values ?? []).includes(host),
      );
      if (!matchesHost) continue;
      for (const a of rule.Actions ?? []) {
        if (a.TargetGroupArn) tgArns.push(a.TargetGroupArn);
        for (const tg of a.ForwardConfig?.TargetGroups ?? []) {
          if (tg.TargetGroupArn) tgArns.push(tg.TargetGroupArn);
        }
      }
      if (rule.RuleArn) await elb.send(new DeleteRuleCommand({ RuleArn: rule.RuleArn }));
    }
  } catch (e: any) {
    if (e.name !== "LoadBalancerNotFoundException") throw e;
  }
  return [...new Set(tgArns)];
}

// Delete target groups (after the listener rule and compute are detached).
// Not-found / in-use are non-fatal — re-run destroy to mop up.
export async function deleteTargetGroups(region: string, arns: string[]): Promise<void> {
  const elb = new ElasticLoadBalancingV2Client({ region });
  for (const arn of arns) {
    try {
      await elb.send(new DeleteTargetGroupCommand({ TargetGroupArn: arn }));
    } catch (e: any) {
      if (e.name !== "TargetGroupNotFoundException" && e.name !== "ResourceInUseException") throw e;
    }
  }
}
