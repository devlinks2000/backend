# AWS CDK Application: Cognito, DynamoDB, Lambda, and API Gateway

This project is an AWS CDK-based infrastructure that integrates multiple AWS services, including:

- **Amazon Cognito** for user authentication
- **DynamoDB** for data storage
- **Lambda** for serverless logic
- **API Gateway** for managing APIs
- **Route 53** for custom domain setup

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Deployment](#deployment)
- [API Endpoints](#api-endpoints)

## Architecture

The project follows this architecture:

1. **Cognito User Pool**: Handles user registration and authentication.
2. **API Gateway**: Exposes the Lambda functions as REST APIs.
3. **Lambda Functions**: Process requests and interact with DynamoDB.
4. **DynamoDB Table**: Stores application data.
5. **Route 53**: Manages DNS and custom domain setup for the API.

## Prerequisites

Before you begin, ensure you have the following installed:

- [AWS CLI](https://aws.amazon.com/cli/) (v2 or later)
- [AWS CDK](https://aws.amazon.com/cdk/) (v2)
- [Node.js](https://nodejs.org/) (v14.x or later)
- [TypeScript](https://www.typescriptlang.org/)
- AWS Account and appropriate permissions

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/your-repo-name.git
   cd your-repo-name
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Ensure that your AWS CLI is properly configured:

   ```bash
   aws configure
   ```

## Deployment

To deploy the application, run:

```bash
cdk deploy
```

This will deploy all the necessary resources in your AWS account. CDK will prompt for confirmation before creating resources.

## API Endpoints

- **POST /register:** Register a new user.
- **POST /login:** Authenticate a user.
- **POST /link:** Create a new link (authenticated).
- **GET /link:** Fetch a public link.
- **GET /privateLink:** Fetch a private link (Cognito authenticated).
