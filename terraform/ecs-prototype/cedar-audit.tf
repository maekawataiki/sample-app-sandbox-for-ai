# Visibility into Cedar authorization decisions. Every service's cedar-auth
# middleware logs a structured JSON line per request:
#   {"event":"cedar_authz","allowed":false,"principal":"...","action":"GET","resource":"/","service":"svc"}
# All services on this cluster share aws_cloudwatch_log_group.services, so one
# metric filter covers every service without per-service wiring.
resource "aws_cloudwatch_log_metric_filter" "cedar_denied" {
  name           = "${local.name}-cedar-denied"
  log_group_name = aws_cloudwatch_log_group.services.name
  pattern        = "{ $.event = \"cedar_authz\" && $.allowed = false }"

  metric_transformation {
    name          = "CedarAuthzDenied"
    namespace     = "Prototype/CedarAuth"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# Fires on a burst of denies — either a misconfigured policy locking out a
# legitimate group, or repeated unauthorized access attempts. No alarm_actions
# by default; pass alarm_sns_topic_arn to wire it to an on-call notification.
resource "aws_cloudwatch_metric_alarm" "cedar_denied_spike" {
  alarm_name          = "${local.name}-cedar-denied-spike"
  alarm_description   = "Cedar authorization is denying an unusual number of requests on ${local.name} — check for a misconfigured policy or unauthorized access attempts."
  namespace           = aws_cloudwatch_log_metric_filter.cedar_denied.metric_transformation[0].namespace
  metric_name         = aws_cloudwatch_log_metric_filter.cedar_denied.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.cedar_denied_alarm_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}
