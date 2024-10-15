export const lambdaEnableCors = () => {
  return {
    isBase64Encoded: false,
    headers: {
      "Content-Type": "application/json",

      // 👇 allow CORS for all origins
      "Access-Control-Allow-Origin": "https://davidarevalo.xyz", // Required for CORS support to work
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
      "Access-Control-Allow-Credentials": "true", // Required for cookies, authorization headers with HTTPS
      "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST,DELETE",
    },
  };
};
