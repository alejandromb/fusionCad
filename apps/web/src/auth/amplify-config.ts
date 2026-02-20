import { Amplify } from 'aws-amplify';

/**
 * Configure Amplify with Cognito User Pool.
 * Returns true if auth is enabled, false if env vars are missing.
 */
export function configureAmplify(): boolean {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

  if (!userPoolId || !userPoolClientId) {
    return false;
  }

  // Extract region from User Pool ID (e.g., "us-east-1_abc123" → "us-east-1")
  const region = userPoolId.split('_')[0];

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          email: true,
        },
      },
    },
  });

  return true;
}
