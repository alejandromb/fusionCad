import { Amplify } from 'aws-amplify';

/**
 * Configure Amplify with Cognito User Pool.
 * Supports optional OAuth (Google/GitHub) when VITE_COGNITO_OAUTH_DOMAIN is set.
 * Returns true if auth is enabled, false if env vars are missing.
 */
export function configureAmplify(): boolean {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

  if (!userPoolId || !userPoolClientId) {
    return false;
  }

  const oauthDomain = import.meta.env.VITE_COGNITO_OAUTH_DOMAIN;
  const redirectSignIn = import.meta.env.VITE_OAUTH_REDIRECT_SIGNIN || window.location.origin;
  const redirectSignOut = import.meta.env.VITE_OAUTH_REDIRECT_SIGNOUT || window.location.origin;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          email: true,
          ...(oauthDomain ? {
            oauth: {
              domain: oauthDomain,
              scopes: ['openid', 'email', 'profile'] as any,
              redirectSignIn: [redirectSignIn],
              redirectSignOut: [redirectSignOut],
              responseType: 'code' as const,
            },
          } : {}),
        },
      },
    },
  });

  return true;
}

/** Whether OAuth (Google/GitHub) is configured */
export function isOAuthEnabled(): boolean {
  return !!import.meta.env.VITE_COGNITO_OAUTH_DOMAIN;
}
