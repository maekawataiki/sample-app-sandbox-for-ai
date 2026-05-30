import type { Config, Credentials } from "../config";
import { loadCredentials, saveCredentials } from "../config";
import { cognitoLogin, cognitoRefresh } from "./cognito";
import { oktaLogin } from "./okta";

export async function login(config: Config): Promise<Credentials> {
  if (config.authProvider === "cognito") return cognitoLogin(config);
  if (config.authProvider === "okta") return oktaLogin(config);
  throw new Error(`Unknown auth provider: ${config.authProvider}`);
}

const REFRESH_LEEWAY_MS = 60 * 1000;

/**
 * Returns valid credentials, refreshing them transparently if the access token
 * is expired (or about to expire) and a refresh token is available. Throws if
 * no usable credentials exist so callers can prompt the user to `prototype login`.
 */
export async function ensureValidCredentials(config: Config): Promise<Credentials> {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error("Not logged in. Run `prototype login`.");
  }

  if (creds.expiresAt - REFRESH_LEEWAY_MS > Date.now()) {
    return creds;
  }

  if (!creds.refreshToken) {
    throw new Error("Session expired and no refresh token is available. Run `prototype login`.");
  }

  if (config.authProvider !== "cognito") {
    throw new Error(`Session expired. Run \`prototype login\` (refresh not implemented for ${config.authProvider}).`);
  }

  const refreshed = await cognitoRefresh(config, creds.refreshToken);
  saveCredentials(refreshed);
  return refreshed;
}
