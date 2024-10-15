import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import * as _ from 'lodash';

AWSXRay.captureAWS(require('aws-sdk'));

const dynamodb = new AWS.DynamoDB.DocumentClient();

const s3 = new AWS.S3();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const queryStringParameters = event.queryStringParameters || {};
    const id = queryStringParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'ID is required' }),
      };
    }


      const result = await dynamodb
      .query({
        TableName: process.env.DYNAMO_TABLE_NAME!,
        IndexName: 'IdIndex', // GSI for querying by id
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: {
          ':id': id,
        },
      })
      .promise();

    if (!result.Items) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Item not found' }),
      };
    }

    const userItem = result.Items[0];
    if (userItem.avatar && typeof userItem.avatar === 'string') {
      const avatarKey = userItem.avatar;
      const signedUrl = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: avatarKey,
        Expires: 600, // Expires in 10 minutes
      });
      userItem.avatar = signedUrl; // Assign the signed URL back to the avatar property
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items[0]),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error retrieving item', error: error.message }),
    };
  }
};
