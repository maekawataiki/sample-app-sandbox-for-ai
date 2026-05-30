import open from "open";
import pc from "picocolors";
import type { Config, Credentials } from "../config";
import { parseEmailFromJwt } from "./jwt";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface TokenError {
  error: string;
  error_description?: string;
}

/**
 * Okta OAuth Device Authorization Flow.
 * https://developer.okta.com/docs/guides/device-authorization-grant/main/
 */
export async function oktaLogin(config: Config): Promise<Credentials> {
  if (!config.authClientId) {
    throw new Error("AUTH_CLIENT_ID is not set.");
  }
  if (!config.authIssuer) {
    throw new Error("AUTH_ISSUER is not set.");
  }

  const deviceRes = await fetch(`${config.authIssuer}/v1/device/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.authClientId,
      scope: "openid profile email offline_access",
    }),
  });

  if (!deviceRes.ok) {
    throw new Error(`Device authorization failed: ${deviceRes.status} ${await deviceRes.text()}`);
  }

  const device = (await deviceRes.json()) as DeviceCodeResponse;

  console.log("");
  console.log(pc.bold("Verification code:"), pc.cyan(device.user_code));
  console.log(pc.dim(`Opening browser to: ${device.verification_uri}`));
  console.log("");

  await open(device.verification_uri_complete).catch(() => {
    console.log(pc.yellow(`Could not open browser. Please visit: ${device.verification_uri_complete}`));
  });

  const expiresAt = Date.now() + device.expires_in * 1000;
  let interval = device.interval * 1000;

  while (Date.now() < expiresAt) {
    await sleep(interval);

    const tokenRes = await fetch(`${config.authIssuer}/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.authClientId,
        device_code: device.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (tokenRes.ok) {
      const token = (await tokenRes.json()) as TokenResponse;
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        email: parseEmailFromJwt(token.access_token),
      };
    }

    const err = (await tokenRes.json()) as TokenError;
    if (err.error === "authorization_pending") continue;
    if (err.error === "slow_down") {
      interval += 5000;
      continue;
    }
    throw new Error(`Token request failed: ${err.error} - ${err.error_description ?? ""}`);
  }

  throw new Error("Device authorization timed out");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
