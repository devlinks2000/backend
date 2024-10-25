export const lambdaEnableCors = () => {
  return {
    isBase64Encoded: false,
    headers: {
      "Content-Type": "application/json",

      "Access-Control-Allow-Origin": `https://${process.env.AWS_DOMAIN_NAME}`,
      "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
      "Access-Control-Allow-Credentials": "true", 
      "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST,DELETE",
    },
  };
};
