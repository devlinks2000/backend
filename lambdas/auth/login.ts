import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';

const cognito = new AWS.CognitoIdentityServiceProvider();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const { username, password } = JSON.parse(event.body || '{}');

  // Define parameters for the Cognito initiateAuth API call
  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH', // Authentication flow for user with password
    ClientId: process.env.CLIENT_ID!, // Your Cognito User Pool Client ID
    AuthParameters: {
      USERNAME: username, // Use email or username as the key
      PASSWORD: password
    }
  };

  try {
    // Call the initiateAuth API
    const result = await cognito.initiateAuth(params).promise();
    
    // Return success response with the token
    return {
      statusCode: 200,
      body: JSON.stringify({ ...result.AuthenticationResult })
    };
  } catch (error: any) {
    // Return error response if authentication fails
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid username or password', error: error.message })
    };
  }
};
