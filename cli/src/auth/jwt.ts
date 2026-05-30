// Display-only: extracts the email claim without verifying the JWT signature.
// Safe because the token was just retrieved over TLS from the auth provider
// in the same call site. NEVER use this output for an authorization decision.
export function parseEmailFromJwt(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return decoded.email ?? decoded.username ?? decoded.sub;
  } catch {
    return undefined;
  }
}
