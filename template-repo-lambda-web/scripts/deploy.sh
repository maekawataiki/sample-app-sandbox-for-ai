#!/usr/bin/env bash
# Deploy this service as a container-image Lambda (AWS Lambda Web Adapter) behind
# the shared, Cognito-authenticated ALB. The image is built/pushed by the
# workflow; this script creates/updates the function and wires the ALB.
#
# Same Express app as ECS/EKS — LWA bridges the Lambda Runtime API to it. Good
# for serverless web/API apps that want scale-to-zero without rewriting to a
# native Lambda handler.
set -euo pipefail

: "${AWS_ACCOUNT_ID:?}"; : "${AWS_REGION:?}"; : "${SERVICE_NAME:?}"
: "${ECR_REPOSITORY:?}"; : "${IMAGE_TAG:?}"; : "${INGRESS_HOST:?}"
: "${COGNITO_USER_POOL_ARN:?}"; : "${COGNITO_CLIENT_ID:?}"
: "${COGNITO_USER_POOL_DOMAIN:?}"; : "${ALB_NAME:?}"

FUNCTION_NAME="prototype-${SERVICE_NAME}"
EXEC_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ALB_NAME}-exec"
IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"

aws() { command aws --region "$AWS_REGION" "$@"; }

echo "==> Discovering shared ALB listener"
ALB_ARN=$(aws elbv2 describe-load-balancers --names "$ALB_NAME" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
  --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text)
echo "    listener=$LISTENER_ARN"

echo "==> Creating / updating function $FUNCTION_NAME (image)"
if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" \
    --image-uri "$IMAGE_URI" --publish >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
    --role "$EXEC_ROLE_ARN" --timeout 30 --memory-size 512 \
    --environment "Variables={SERVICE_NAME=$SERVICE_NAME}" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
else
  aws lambda create-function --function-name "$FUNCTION_NAME" \
    --package-type Image --code "ImageUri=$IMAGE_URI" --role "$EXEC_ROLE_ARN" \
    --timeout 30 --memory-size 512 \
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

echo "==> Live at https://$INGRESS_HOST"
