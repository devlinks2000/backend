import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import * as _ from 'lodash';
import { nanoid } from 'nanoid';
import { extname } from 'path';

AWSXRay.captureAWS(require('aws-sdk'));

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = _.get(event, "requestContext.authorizer.claims.sub");

    // Parse the JSON body
    const formData = JSON.parse(event.body || '{}');

    let avatarFile: any = null;

    // Collect form data including Base64 encoded avatar
    const { firstName = '', lastName = '', avatar, links = [], email = "" } = formData;

    // Validate and process the avatar if provided
    if (avatar && avatar.contentType?.startsWith('image/')) {
      // Convert Base64-encoded image to buffer
      const avatarBuffer = Buffer.from(avatar.content, 'base64');
      avatarFile = {
        content: avatarBuffer,
        contentType: avatar.contentType,
        filename: `${nanoid()}${extname(avatar.filename)}`,
      };
    } else if (avatar) {
      throw new Error('Invalid file type, only images are allowed');
    }

    // Check if the item already exists in DynamoDB
      const existingItem = await dynamodb
    .query({
      TableName: process.env.DYNAMO_TABLE_NAME!,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    })
    .promise();

    const id = _.get(existingItem, "Items[0].id")

    let avatarUrl = _.get(existingItem, "Items[0].avatar", "");
    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('S3 bucket name is not set in environment variables.');
    }

    if (avatarFile) {
      const s3Key = `${userId}/${nanoid()}${extname(avatarFile.filename)}`;

      // Delete existing avatar if present
      if (_.get(existingItem, "Items[0].avatar", "")) {
        const oldAvatarKey = _.get(existingItem, "Items[0].avatar", "")
        await s3
          .deleteObject({
            Bucket: bucketName,
            Key: oldAvatarKey,
          })
          .promise();
      }

      // Upload new avatar to S3
      await s3.upload({
        Bucket: bucketName,
        Key: s3Key,
        Body: avatarFile.content, // Buffer from Base64
        ContentType: avatarFile.contentType,
      }).promise();

      avatarUrl = s3Key;
    }

    const item = {
      userId,
      avatar: avatarUrl,
      firstName,
      lastName,
      links,
      email,
      id: id ?? nanoid(),
    };

    if (!id) {
      // Create new item in DynamoDB
      await dynamodb
        .put({
          TableName: process.env.DYNAMO_TABLE_NAME!,
          Item: item,
        })
        .promise();

      return {
        statusCode: 201,
        body: JSON.stringify({ message: 'User created successfully', item }),
      };
    } else {
      // Update existing item in DynamoDB
      await dynamodb
        .update({
          TableName: process.env.DYNAMO_TABLE_NAME!,
          Key: { userId },
          UpdateExpression: 'set avatar = :avatar, firstName = :firstName, lastName = :lastName',
          ExpressionAttributeValues: {
            ':avatar': avatarUrl || '',
            ':firstName': firstName,
            ':lastName': lastName,
          },
        })
        .promise();

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'User updated successfully', item }),
      };
    }
  } catch (error: any) {
    console.error(error);
    if (error.code === 'NotAuthorizedException') {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid or expired token' }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error creating or updating user', error: error.message }),
    };
  }
};
