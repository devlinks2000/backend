import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import * as AWS from "aws-sdk";
import * as AWSXRay from "aws-xray-sdk";
import { lambdaEnableCors } from "../../utils/lambda_enable_cors";

AWSXRay.captureAWS(require("aws-sdk"));

const cognito = new AWS.CognitoIdentityServiceProvider();

export const handler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const { email, username, password } = JSON.parse(event.body || "{}");

  const createUserParams = {
    UserPoolId: process.env.USER_POOL_ID!,
    Username: username,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "preferred_username", Value: username },
    ],
    MessageAction: "SUPPRESS",
  };

  try {
    // Step 1: Create the user
    await cognito.adminCreateUser(createUserParams).promise();

    // Step 2: Set a permanent password for the user
    const setPasswordParams = {
      UserPoolId: process.env.USER_POOL_ID!,
      Username: username,
      Password: password,
      Permanent: true,
    };

    await cognito.adminSetUserPassword(setPasswordParams).promise();

    // Step 3: Mark email as verified
    const adminUpdateUserAttributesParams = {
      UserPoolId: process.env.USER_POOL_ID!,
      Username: username,
      UserAttributes: [
        { Name: "email_verified", Value: "true" }, // Mark email as verified
      ],
    };

    await cognito
      .adminUpdateUserAttributes(adminUpdateUserAttributesParams)
      .promise();

    // Step 4: Authenticate the user to get tokens
    const authParams = {
      AuthFlow: "USER_PASSWORD_AUTH", // Authentication flow for user with password
      ClientId: process.env.CLIENT_ID!,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };

    const authResponse = await cognito.initiateAuth(authParams).promise();

    return {
      statusCode: 200,
      ...lambdaEnableCors(),
      body: JSON.stringify({
        message: "User registered successfully and email verified.",
        ...authResponse.AuthenticationResult,
      }),
    };
  } catch (error: any) {
    console.error("Error processing user registration:", error);
    return {
      statusCode: 500,
      ...lambdaEnableCors(),
      body: JSON.stringify({ message: error.message }),
    };
  }
};
