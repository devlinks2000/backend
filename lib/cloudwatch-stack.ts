import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

interface MonitoringStackProps extends cdk.StackProps {
  api:  apigateway.RestApi
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const logGroup = new logs.LogGroup(this, "ApiGatewayLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
    });

    new logs.MetricFilter(this, "Api500ErrorMetricFilter", {
      logGroup: logGroup,
      filterPattern: logs.FilterPattern.literal('5XX'),
      metricNamespace: "ApiGateway",
      metricName: "5XXError",
      defaultValue: 0,
      metricValue: "1",
    });

    const errorNotificationTopic = new sns.Topic(this, "ApiErrorNotificationTopic");

    errorNotificationTopic.addSubscription(
      new subscriptions.EmailSubscription(process.env.EMAIL_ALERT_SUBSCRIPTION!)
    );

    const errorAlarm = new cloudwatch.Alarm(this, "Api500ErrorAlarm", {
      metric: new cloudwatch.Metric({
        namespace: "ApiGateway",
        metricName: "5XXError",
        statistic: "sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: "Alarm for 500 errors in API Gateway",
    });

    errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(errorNotificationTopic));
  }
}
