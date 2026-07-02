import * as crypto from 'node:crypto';
import * as https from 'node:https';
import type { CedarUser } from './types.js';

interface AlbJwtHeader {
  kid: string;
  alg: string;
  signer?: string;
}

interface AlbJwtPayload {
  sub: string;
  email?: string;
  'cognito:groups'?: string[];
  exp: number;
  signer?: string;
}

interface PublicKeyCacheEntry {
  pem: string;
  fetchedAt: number;
}

type KeyFetcher = (region: string, kid: string) => Promise<string>;

const keyCache = new Map<string, PublicKeyCacheEntry>();
const KEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let keyFetcher: KeyFetcher = defaultFetchKey;

/** Override the key fetcher for testing. */
export function _setKeyFetcher(fn: KeyFetcher): void {
  keyFetcher = fn;
}

export function _resetKeyFetcher(): void {
  keyFetcher = defaultFetchKey;
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

async function defaultFetchKey(region: string, kid: string): Promise<string> {
  const cacheKey = `${region}/${kid}`;
  const cached = keyCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) {
    return cached.pem;
  }
  const url = `https://public-keys.auth.elb.${region}.amazonaws.com/${kid}`;
  const pem = await new Promise<string>((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`ALB key fetch failed: HTTP ${res.statusCode} from ${url}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      })
      .on('error', reject);
  });
  keyCache.set(cacheKey, { pem, fetchedAt: Date.now() });
  return pem;
}

async function getPublicKey(region: string, kid: string): Promise<string> {
  return keyFetcher(region, kid);
}

export async function verifyAlbJwt(
  token: string,
  region: string,
  allowedAlbArns?: string[],
): Promise<AlbJwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: expected 3 parts');
  }
  const [headerB64, payloadB64, sigB64] = parts;

  let header: AlbJwtHeader;
  try {
    header = JSON.parse(b64urlDecode(headerB64)) as AlbJwtHeader;
  } catch {
    throw new Error('Malformed JWT header');
  }

  if (!header.kid) {
    throw new Error('JWT header missing kid');
  }
  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported JWT algorithm: ${header.alg}`);
  }

  const publicKeyPem = await getPublicKey(region, header.kid);

  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(sigB64, 'base64url');

  const verifier = crypto.createVerify('SHA256');
  verifier.update(signingInput);
  const valid = verifier.verify(
    { key: publicKeyPem, dsaEncoding: 'ieee-p1363' },
    signature,
  );
  if (!valid) {
    throw new Error('JWT signature verification failed');
  }

  let payload: AlbJwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64)) as AlbJwtPayload;
  } catch {
    throw new Error('Malformed JWT payload');
  }

  if (typeof payload.exp !== 'number') {
    throw new Error('JWT missing exp claim');
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT has expired');
  }

  if (allowedAlbArns && allowedAlbArns.length > 0) {
    const signer = header.signer ?? payload.signer;
    if (!signer || !allowedAlbArns.includes(signer)) {
      throw new Error(`JWT signer "${signer}" is not in the allowed ALB ARN list`);
    }
  }

  return payload;
}

/** Decode without signature verification — only for extracting groups from x-amzn-oidc-accesstoken. */
export function unsafeDecodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(b64urlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractUser(
  albPayload: AlbJwtPayload,
  accessToken?: string,
): CedarUser {
  const groups: string[] =
    albPayload['cognito:groups'] ??
    (accessToken ? extractGroupsFromAccessToken(accessToken) : []);

  return {
    sub: albPayload.sub,
    email: albPayload.email ?? albPayload.sub,
    groups,
  };
}

function extractGroupsFromAccessToken(token: string): string[] {
  const payload = unsafeDecodeJwtPayload(token);
  if (!payload) return [];
  const groups = payload['cognito:groups'];
  if (!Array.isArray(groups)) return [];
  return groups.filter((g): g is string => typeof g === 'string');
}

/** Reset key cache and fetcher (exposed for testing). */
export function clearKeyCache(): void {
  keyCache.clear();
}
