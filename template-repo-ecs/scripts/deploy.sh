#!/usr/bin/env bash
# Deploy this service to ECS on Fargate, behind the shared Cognito-authenticated
# ALB. Idempotent: the first run creates the target group, listener rule, and
# ECS service; later runs register a new task definition and roll the service.
#
# In the EKS variant the load-balancer controller creates the target group and
# the listener rule automatically from the Helm Ingress. ECS has no such
# controller, so this script does that wiring explicitly via the AWS CLI — which
# is exactly the trade-off this sample is meant to make visible.
set -euo pipefail

: "${AWS_ACCOUNT_ID:?}"; : "${AWS_REGION:?}"; : "${CLUSTER_NAME:?}"
: "${SERVICE_NAME:?}"; : "${ECR_REPOSITORY:?}"; : "${IMAGE_TAG:?}"
: "${INGRESS_HOST:?}"; : "${COGNITO_USER_POOL_ARN:?}"
: "${COGNITO_CLIENT_ID:?}"; : "${COGNITO_USER_POOL_DOMAIN:?}"

CONTAINER_PORT="${CONTAINER_PORT:-8080}"
DESIRED_COUNT="${DESIRED_COUNT:-2}"
TASK_CPU="${TASK_CPU:-256}"
TASK_MEMORY="${TASK_MEMORY:-512}"

IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"
EXEC_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${CLUSTER_NAME}-task-execution"
TASK_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${CLUSTER_NAME}-task"
LOG_GROUP="/ecs/${CLUSTER_NAME}"

# Pin every call to the right region without repeating --region everywhere.
aws() { command aws --region "$AWS_REGION" "$@"; }

echo "==> Discovering shared infrastructure (tag-driven, no hard-coded IDs)"
read -r ALB_ARN VPC_ID < <(aws elbv2 describe-load-balancers --names "$CLUSTER_NAME" \
  --query 'LoadBalancers[0].[LoadBalancerArn,VpcId]' --output text)
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
  --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text)
SERVICE_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=${CLUSTER_NAME}-service" \
  --query 'SecurityGroups[0].GroupId' --output text)
SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:prototype:tier,Values=private" \
  --query 'Subnets[].SubnetId' --output text | tr '[:space:]' ',' | sed 's/,$//')
echo "    listener=$LISTENER_ARN sg=$SERVICE_SG subnets=$SUBNETS"

echo "==> Ensuring target group"
# ALB target-group names are capped at 32 chars; the host-header on the listener
# rule (matched in destroy) is the real key, so a truncated name is fine.
TG_NAME=$(printf '%s' "$SERVICE_NAME" | cut -c1-32 | sed 's/-*$//')
TG_ARN=$(aws elbv2 describe-target-groups --names "$TG_NAME" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)
if [ -z "${TG_ARN:-}" ] || [ "$TG_ARN" = "None" ]; then
  TG_ARN=$(aws elbv2 create-target-group \
    --name "$TG_NAME" --protocol HTTP --port "$CONTAINER_PORT" \
    --target-type ip --vpc-id "$VPC_ID" \
    --health-check-protocol HTTP --health-check-path /healthz --matcher HttpCode=200 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
fi
echo "    tg=$TG_ARN"

echo "==> Ensuring listener rule for $INGRESS_HOST"
CONDITIONS=$(jq -nc --arg h "$INGRESS_HOST" \
  '[{Field:"host-header",HostHeaderConfig:{Values:[$h]}}]')
ACTIONS=$(jq -nc \
  --arg poolArn "$COGNITO_USER_POOL_ARN" \
  --arg clientId "$COGNITO_CLIENT_ID" \
  --arg domain "$COGNITO_USER_POOL_DOMAIN" \
  --arg tg "$TG_ARN" \
  '[
    {Type:"authenticate-cognito", Order:1, AuthenticateCognitoConfig:{
      UserPoolArn:$poolArn, UserPoolClientId:$clientId, UserPoolDomain:$domain,
      OnUnauthenticatedRequest:"authenticate", Scope:"openid email",
      SessionCookieName:"AWSELBAuthSessionCookie", SessionTimeout:604800}},
    {Type:"forward", Order:2, TargetGroupArn:$tg}
  ]')
RULE_ARN=$(aws elbv2 describe-rules --listener-arn "$LISTENER_ARN" \
  --query "Rules[?Conditions[?Field=='host-header' && contains(HostHeaderConfig.Values, '$INGRESS_HOST')]].RuleArn | [0]" \
  --output text)
if [ -z "$RULE_ARN" ] || [ "$RULE_ARN" = "None" ]; then
  # Pick the next free priority (rules on a listener need distinct priorities).
  NEXT=1
  for p in $(aws elbv2 describe-rules --listener-arn "$LISTENER_ARN" \
    --query "Rules[?Priority!='default'].Priority" --output text); do
    [ "$p" -ge "$NEXT" ] && NEXT=$((p + 1))
  done
  aws elbv2 create-rule --listener-arn "$LISTENER_ARN" --priority "$NEXT" \
    --conditions "$CONDITIONS" --actions "$ACTIONS" >/dev/null
  echo "    created rule at priority $NEXT"
else
  aws elbv2 modify-rule --rule-arn "$RULE_ARN" --actions "$ACTIONS" >/dev/null
  echo "    updated existing rule"
fi

echo "==> Registering task definition"
# readonlyRootFilesystem + a writable ephemeral /tmp mirrors the EKS pod's
# securityContext (read-only root, emptyDir /tmp).
TASKDEF=$(jq -n \
  --arg family "$SERVICE_NAME" --arg cpu "$TASK_CPU" --arg mem "$TASK_MEMORY" \
  --arg exec "$EXEC_ROLE_ARN" --arg task "$TASK_ROLE_ARN" --arg image "$IMAGE_URI" \
  --argjson port "$CONTAINER_PORT" --arg svc "$SERVICE_NAME" \
  --arg lg "$LOG_GROUP" --arg region "$AWS_REGION" \
  '{
    family: $family, networkMode: "awsvpc", requiresCompatibilities: ["FARGATE"],
    cpu: $cpu, memory: $mem, executionRoleArn: $exec, taskRoleArn: $task,
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    volumes: [{name: "tmp"}],
    containerDefinitions: [{
      name: "app", image: $image, essential: true,
      readonlyRootFilesystem: true, user: "1000",
      portMappings: [{containerPort: $port, protocol: "tcp"}],
      environment: [{name: "PORT", value: ($port|tostring)}, {name: "SERVICE_NAME", value: $svc}, {name: "AWS_REGION", value: $region}],
      mountPoints: [{sourceVolume: "tmp", containerPath: "/tmp", readOnly: false}],
      logConfiguration: {logDriver: "awslogs", options: {
        "awslogs-group": $lg, "awslogs-region": $region, "awslogs-stream-prefix": $svc}}
    }]
  }')
TASKDEF_ARN=$(aws ecs register-task-definition --cli-input-json "$TASKDEF" \
  --query 'taskDefinition.taskDefinitionArn' --output text)
echo "    taskdef=$TASKDEF_ARN"

echo "==> Deploying ECS service"
STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" \
  --query 'services[0].status' --output text 2>/dev/null || echo "NONE")
if [ "$STATUS" = "ACTIVE" ]; then
  aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
    --task-definition "$TASKDEF_ARN" --force-new-deployment >/dev/null
  echo "    rolled existing service"
else
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" \
    --task-definition "$TASKDEF_ARN" --desired-count "$DESIRED_COUNT" \
    --capacity-provider-strategy "capacityProvider=FARGATE,weight=1,base=1" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SERVICE_SG],assignPublicIp=DISABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=app,containerPort=$CONTAINER_PORT" \
    --health-check-grace-period-seconds 30 \
    --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},minimumHealthyPercent=100,maximumPercent=200" \
    >/dev/null
  echo "    created service"
fi

echo "==> Waiting for the service to stabilise"
aws ecs wait services-stable --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME"
echo "==> Live at https://$INGRESS_HOST"
