import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as certificates from "aws-cdk-lib/aws-certificatemanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";

interface CdkApiGatewayStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  devlinksTable: cdk.aws_dynamodb.Table;
}

export class CdkApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: CdkApiGatewayStackProps) {
    super(scope, id, props);

    const domainName = process.env.AWS_DOMAIN_NAME as string;
    const hostedZone = this.createHostedZone(domainName);
    const certificate = this.createCertificate(domainName, hostedZone);
    const customDomain = this.createApiGatewayDomain(domainName, certificate);
    this.createApiGatewayAliasRecord(customDomain, hostedZone);

    this.api = this.createApiGateway();
    // props.createApiGatewayMonitoring(api)

    const requestValidator = this.createRequestValidator(this.api);
    const registerRequestModel = this.createRequestModel(
      this.api,
      "RegisterRequestModel",
      {
        email: { type: apigateway.JsonSchemaType.STRING },
        username: { type: apigateway.JsonSchemaType.STRING },
        password: { type: apigateway.JsonSchemaType.STRING },
      }
    );

    const loginRequestModel = this.createRequestModel(
      this.api,
      "LoginRequestModel",
      {
        username: { type: apigateway.JsonSchemaType.STRING },
        password: { type: apigateway.JsonSchemaType.STRING },
      }
    );

    const s3Bucket = this.createS3Bucket();

    const createLinkLambda = this.createLambdaFunction(
      "CreateLinkFunction",
      "./lambdas/links/createLink.ts",
      {
        USER_POOL_ID: props.userPool.userPoolId,
        DYNAMO_TABLE_NAME: props.devlinksTable.tableName,
        S3_BUCKET_NAME: s3Bucket.bucketName,
      },
      ["sharp"]
    );

    this.grantTableAndBucketPermissions(
      createLinkLambda,
      props.devlinksTable,
      s3Bucket
    );

    const registerLambda = this.createLambdaFunction(
      "RegisterFunction",
      "./lambdas/auth/register.ts",
      {
        USER_POOL_ID: props.userPool.userPoolId,
        CLIENT_ID: props.userPoolClient.userPoolClientId,
        S3_BUCKET_NAME: s3Bucket.bucketName,
      }
    );

    const loginLambda = this.createLambdaFunction(
      "LoginFunction",
      "./lambdas/auth/login.ts",
      {
        CLIENT_ID: props.userPoolClient.userPoolClientId,
      }
    );

    this.createApiMethods(
      this.api,
      registerLambda,
      loginLambda,
      requestValidator,
      registerRequestModel,
      loginRequestModel
    );

    this.grantCognitoPermissions(registerLambda, props.userPool);
    this.grantCognitoPermissions(loginLambda, props.userPool, [
      "cognito-idp:InitiateAuth",
    ]);

    const getLinkLambda = this.createLambdaFunction(
      "GetLinkFunction",
      "./lambdas/links/getLink.ts",
      {
        DYNAMO_TABLE_NAME: props.devlinksTable.tableName,
        S3_BUCKET_NAME: s3Bucket.bucketName,
      }
    );

    this.grantTablePermissions(getLinkLambda, props.devlinksTable);

    const linkResource = this.api.root.addResource("link");
    this.addCorsToResource(linkResource);
    this.addLinkResourceMethods(
      linkResource,
      createLinkLambda,
      getLinkLambda,
      props.userPool,
      this.api
    );

    const privateGetLinkLambda = this.createLambdaFunction(
      "PrivateGetLinkFunction",
      "./lambdas/links/privateGetLink.ts",
      {
        DYNAMO_TABLE_NAME: props.devlinksTable.tableName,
        S3_BUCKET_NAME: s3Bucket.bucketName,
      }
    );

    s3Bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [s3Bucket.arnForObjects("*")], // Allows access to all objects in the bucket
        principals: [
          new iam.ArnPrincipal(privateGetLinkLambda.role!.roleArn),
          new iam.ArnPrincipal(getLinkLambda.role!.roleArn),
        ], // Allow the Lambda execution role
      })
    );

    s3Bucket.grantRead(privateGetLinkLambda);

    this.grantTablePermissions(privateGetLinkLambda, props.devlinksTable);

    const privateGetLinkResource = this.api.root.addResource("privateLink");
    this.addCorsToResource(privateGetLinkResource);
    privateGetLinkResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(privateGetLinkLambda),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: new apigateway.CognitoUserPoolsAuthorizer(
          this,
          "PrivateCognitoAuthorizer",
          {
            cognitoUserPools: [props.userPool],
          }
        ),
        methodResponses: [
          {
            statusCode: "401",
            responseModels: {
              "application/json": new apigateway.Model(
                this,
                "ErrorResponseModel401",
                {
                  restApi: this.api,
                  contentType: "application/json",
                  schema: {
                    type: apigateway.JsonSchemaType.OBJECT,
                    properties: {
                      message: { type: apigateway.JsonSchemaType.STRING },
                    },
                    required: ["message"],
                  },
                }
              ),
            },
            responseParameters: {
              "method.response.header.Content-Type": true,
            },
          },
          {
            statusCode: "403",
            responseModels: {
              "application/json": new apigateway.Model(
                this,
                "ErrorResponseModel403",
                {
                  // Unique name
                  restApi: this.api,
                  contentType: "application/json",
                  schema: {
                    type: apigateway.JsonSchemaType.OBJECT,
                    properties: {
                      message: { type: apigateway.JsonSchemaType.STRING },
                    },
                    required: ["message"],
                  },
                }
              ),
            },
            responseParameters: {
              "method.response.header.Content-Type": true,
            },
          },
        ],
      }
    );

    // Custom domain mapping
    new apigateway.BasePathMapping(this, "BasePathMapping", {
      domainName: customDomain,
      restApi: this.api,
      stage: this.api.deploymentStage,
    });
  }

  private createHostedZone(domainName: string) {
    return route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName,
    });
  }

  private createCertificate(
    domainName: string,
    hostedZone: route53.IHostedZone
  ) {
    return new certificates.Certificate(this, "AppCertificate", {
      domainName,
      subjectAlternativeNames: [`*.${domainName}`], // Wildcard SAN
      validation: certificates.CertificateValidation.fromDns(hostedZone), // Use Route 53 for DNS validation
    });
  }

  private createApiGatewayDomain(
    domainName: string,
    certificate: certificates.ICertificate
  ) {
    return new apigateway.DomainName(this, "CustomDomain", {
      domainName: `backend.${domainName}`,
      certificate,
    });
  }

  private createApiGatewayAliasRecord(
    customDomain: apigateway.IDomainName,
    hostedZone: route53.IHostedZone
  ) {
    new route53.ARecord(this, "ApiAliasRecord", {
      recordName: "backend",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayDomain(customDomain)
      ),
      zone: hostedZone,
      ttl: cdk.Duration.minutes(1),
    });
  }

  private createLambdaFunction(
    functionName: string,
    entry: string,
    environment: { [key: string]: string },
    nodeModules: string[] = []
  ) {
    return new lambdaNodejs.NodejsFunction(this, functionName, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry,
      functionName,
      handler: "handler",
      memorySize: 400,
      timeout: cdk.Duration.seconds(120),
      bundling: {
        minify: true,
        sourceMap: false,
        nodeModules,
      },
      environment,
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
    });
  }

  private grantCognitoPermissions(
    lambdaFunction: lambda.IFunction,
    userPool: cognito.IUserPool,
    additionalActions: string[] = []
  ) {
    const actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminUpdateUserAttributes",
      ...additionalActions,
    ];

    const policy = new iam.PolicyStatement({
      actions,
      resources: [userPool.userPoolArn],
    });

    lambdaFunction.addToRolePolicy(policy);
  }

  private createApiGateway() {
    return new apigateway.RestApi(this, "Api", {
      restApiName: "User Service",
      description: "This service handles user registration and login.",
    });
  }

  private createRequestValidator(api: apigateway.IRestApi) {
    return new apigateway.RequestValidator(this, "RequestValidator", {
      restApi: api,
      validateRequestBody: true,
      validateRequestParameters: false,
    });
  }

  private createRequestModel(
    api: apigateway.IRestApi,
    modelName: string,
    properties: { [key: string]: any }
  ) {
    return new apigateway.Model(this, modelName, {
      modelName,
      restApi: api,
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          ...properties,
        },
        required: Object.keys(properties),
      },
    });
  }

  private createApiMethods(
    api: apigateway.IRestApi,
    registerLambda: lambda.IFunction,
    loginLambda: lambda.IFunction,
    requestValidator: apigateway.IRequestValidator,
    registerRequestModel: apigateway.IModel,
    loginRequestModel: apigateway.IModel
  ) {
    const loginResource = api.root.addResource("login");
    this.addCorsToResource(loginResource);
    loginResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(loginLambda),
      {
        requestValidator,
        requestModels: { "application/json": loginRequestModel },
      }
    );

    const registerResource = api.root.addResource("register");
    this.addCorsToResource(registerResource);
    registerResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(registerLambda),
      {
        requestValidator,
        requestModels: { "application/json": registerRequestModel },
      }
    );
  }

  private addCorsToResource(resource: apigateway.IResource) {
    resource.addCorsPreflight({
      allowOrigins: ["http://localhost:5173", `https://${process.env.AWS_DOMAIN_NAME}`],
      allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "X-Amz-Security-Token", "X-Amz-User-Agent"],
      allowCredentials: true,
      allowMethods: apigateway.Cors.ALL_METHODS,
    });
  }

  private createS3Bucket() {
    return new s3.Bucket(this, "DevLinksBucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  private grantTableAndBucketPermissions(
    lambdaFunction: lambda.IFunction,
    table: dynamodb.ITable,
    bucket: s3.IBucket
  ) {
    table.grantReadWriteData(lambdaFunction);
    bucket.grantReadWrite(lambdaFunction);
  }

  private grantTablePermissions(
    lambdaFunction: lambda.IFunction,
    table: dynamodb.ITable
  ) {
    table.grantReadData(lambdaFunction);
  }

  private addLinkResourceMethods(
    resource: apigateway.IResource,
    createLinkLambda: lambda.IFunction,
    getLinkLambda: lambda.IFunction,
    userPool: cognito.IUserPool,
    api: cdk.aws_apigateway.RestApi
  ) {
    resource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createLinkLambda),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: new apigateway.CognitoUserPoolsAuthorizer(
          this,
          "CognitoAuthorizer",
          {
            cognitoUserPools: [userPool],
          }
        ),
      }
    );

    resource.addMethod("GET", new apigateway.LambdaIntegration(getLinkLambda), {
      requestParameters: {
        "method.request.querystring.id": true,
      },
      requestValidator: new apigateway.RequestValidator(
        this,
        "GetLinkRequestValidator",
        {
          restApi: api,
          validateRequestParameters: true,
        }
      ),
      methodResponses: [
        {
          statusCode: "200",
          responseModels: {
            "application/json": apigateway.Model.EMPTY_MODEL,
          },
        },
        {
          statusCode: "400",
          responseModels: {
            "application/json": new apigateway.Model(
              this,
              "ErrorResponseModel400",
              {
                restApi: api,
                contentType: "application/json",
                schema: {
                  type: apigateway.JsonSchemaType.OBJECT,
                  properties: {
                    message: { type: apigateway.JsonSchemaType.STRING },
                  },
                  required: ["message"],
                },
              }
            ),
          },
        },
        {
          statusCode: "404",
          responseModels: {
            "application/json": new apigateway.Model(
              this,
              "ErrorResponseModel404",
              {
                restApi: api,
                contentType: "application/json",
                schema: {
                  type: apigateway.JsonSchemaType.OBJECT,
                  properties: {
                    message: { type: apigateway.JsonSchemaType.STRING },
                  },
                  required: ["message"],
                },
              }
            ),
          },
        },
      ],
    });
  }
}
