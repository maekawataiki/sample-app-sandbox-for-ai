import http from "http";
import crypto from "crypto";
import open from "open";
import pc from "picocolors";
import type { Config, Credentials } from "../config";
import { parseEmailFromJwt } from "./jwt";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * Cognito OAuth 2.0 Authorization Code + PKCE flow.
 * Cognito User Pools do not support Device Authorization Grant, so we use
 * a localhost HTTP callback instead.
 */
export async function cognitoLogin(config: Config): Promise<Credentials> {
  if (!config.authClientId) throw new Error("AUTH_CLIENT_ID is not set.");
  if (!config.cognitoDomain) throw new Error("COGNITO_DOMAIN is not set.");
  const port = config.callbackPort ?? 8765;
  const redirectUri = `http://localhost:${port}/callback`;

  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  const authorizeUrl = `https://${config.cognitoDomain}/oauth2/authorize?` + new URLSearchParams({
    response_type: "code",
    client_id: config.authClientId,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString();

  console.log("");
  console.log(pc.bold("Opening browser to sign in..."));
  console.log(pc.dim(authorizeUrl));
  console.log("");

  const codePromise = waitForCallback(port, state);

  await open(authorizeUrl).catch(() => {
    console.log(pc.yellow(`Could not open browser. Please visit:\n${authorizeUrl}`));
  });

  const code = await codePromise;

  const tokenRes = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.authClientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const token = (await tokenRes.json()) as TokenResponse;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    email: parseEmailFromJwt(token.id_token ?? token.access_token),
  };
}

export async function cognitoRefresh(config: Config, refreshToken: string): Promise<Credentials> {
  if (!config.authClientId) throw new Error("AUTH_CLIENT_ID is not set.");
  if (!config.cognitoDomain) throw new Error("COGNITO_DOMAIN is not set.");

  const tokenRes = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.authClientId,
      refresh_token: refreshToken,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token refresh failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const token = (await tokenRes.json()) as TokenResponse;
  return {
    accessToken: token.access_token,
    // Cognito's refresh response does not include a new refresh_token; reuse the existing one.
    refreshToken: token.refresh_token ?? refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    email: parseEmailFromJwt(token.id_token ?? token.access_token),
  };
}

function waitForCallback(port: number, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end("Not found");
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" })
          .end(`<h1>Login failed</h1><p>${error}: ${url.searchParams.get("error_description") ?? ""}</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" }).end("<h1>State mismatch</h1>");
        server.close();
        reject(new Error("OAuth state mismatch (possible CSRF)"));
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" }).end("<h1>Missing code</h1>");
        server.close();
        reject(new Error("OAuth callback missing 'code'"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" })
        .end("<h1>Logged in</h1><p>You can close this tab and return to the terminal.</p>");
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      // Server up; browser will hit it.
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 5 minutes"));
    }, 5 * 60 * 1000).unref();
  });
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
