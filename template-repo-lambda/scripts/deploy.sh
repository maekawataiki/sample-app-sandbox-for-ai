#!/usr/bin/env bash
# Deploy this service as an AWS Lambda function fronted by the shared,
# Cognito-authenticated ALB. Idempotent: the first run creates the function,
# the Lambda target group, and the listener rule; later runs update the code.
#
# This is the serverless lane — no container image, no ECR. The ALB invokes the
# function directly (target-type=lambda), and the authenticate-cognito listener
# rule enforces auth before the function is ever called.
set -euo pipefail

: "${AWS_ACCOUNT_ID:?}"; : "${AWS_REGION:?}"; : "${SERVICE_NAME:?}"
: "${INGRESS_HOST:?}"; : "${COGNITO_USER_POOL_ARN:?}"
: "${COGNITO_CLIENT_ID:?}"; : "${COGNITO_USER_POOL_DOMAIN:?}"
: "${ALB_NAME:?}"

# Function names are prefixed so the deploy IAM role can scope to prototype-*.
FUNCTION_NAME="prototype-${SERVICE_NAME}"
EXEC_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ALB_NAME}-exec"
RUNTIME="nodejs20.x"
HANDLER="src/index.handler"

aws() { command aws --region "$AWS_REGION" "$@"; }

echo "==> Packaging function"
# Bundle dependencies too if they've been installed (add an `npm ci --omit=dev`
# step to the workflow once your package.json has dependencies).
zip -rq function.zip src package.json
[ -d cedar ] && zip -rqg function.zip cedar || true
[ -d node_modules ] && zip -rqg function.zip node_modules || true

echo "==> Discovering shared ALB listener"
ALB_ARN=$(aws elbv2 describe-load-balancers --names "$ALB_NAME" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
  --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text)
echo "    listener=$LISTENER_ARN"

echo "==> Creating / updating function $FUNCTION_NAME"
if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" \
    --zip-file fileb://function.zip --publish >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" --handler "$HANDLER" --role "$EXEC_ROLE_ARN" \
    --timeout 30 --memory-size 256 \
    --environment "Variables={SERVICE_NAME=$SERVICE_NAME}" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
else
  aws lambda create-function --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" --handler "$HANDLER" --role "$EXEC_ROLE_ARN" \
    --zip-file fileb://function.zip --timeout 30 --memory-size 256 \
    --environment "Variables={SERVICE_NAME=$SERVICE_NAME}" >/dev/null
  aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME"
fi
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" \
  --query 'Configuration.FunctionArn' --output text)
echo "    function=$FUNCTION_ARN"

echo "==> Ensuring Lambda target group"
TG_NAME=$(printf '%s' "$FUNCTION_NAME" | cut -c1-32 | sed 's/-*$//')
TG_ARN=$(aws elbv2 describe-target-groups --names "$TG_NAME" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)
if [ -z "${TG_ARN:-}" ] || [ "$TG_ARN" = "None" ]; then
  TG_ARN=$(aws elbv2 create-target-group --name "$TG_NAME" --target-type lambda \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
fi
echo "    tg=$TG_ARN"

# The ALB needs explicit permission to invoke the function; scope it to this TG.
aws lambda add-permission --function-name "$FUNCTION_NAME" \
  --statement-id "alb-invoke" --action "lambda:InvokeFunction" \
  --principal "elasticloadbalancing.amazonaws.com" --source-arn "$TG_ARN" \
  >/dev/null 2>&1 || true
aws elbv2 register-targets --target-group-arn "$TG_ARN" \
  --targets "Id=$FUNCTION_ARN" >/dev/null

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

echo "==> Ensuring Cedar audit metric filter and alarm"
# Lambda only creates the log group on first invocation, so create it up front
# (idempotent) or the metric filter has nothing to attach to.
LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"
aws logs create-log-group --log-group-name "$LOG_GROUP" >/dev/null 2>&1 || true
aws logs put-metric-filter --log-group-name "$LOG_GROUP" \
  --filter-name "${FUNCTION_NAME}-cedar-denied" \
  --filter-pattern '{ $.event = "cedar_authz" && $.allowed = false }' \
  --metric-transformations \
    "metricName=CedarAuthzDenied,metricNamespace=Prototype/CedarAuth,metricValue=1,defaultValue=0" \
  >/dev/null
aws cloudwatch put-metric-alarm \
  --alarm-name "${FUNCTION_NAME}-cedar-denied-spike" \
  --alarm-description "Cedar authorization is denying an unusual number of requests on ${FUNCTION_NAME} — check for a misconfigured policy or unauthorized access attempts." \
  --namespace "Prototype/CedarAuth" --metric-name "CedarAuthzDenied" \
  --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold "${CEDAR_DENIED_ALARM_THRESHOLD:-20}" --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  >/dev/null

echo "==> Live at https://$INGRESS_HOST"
