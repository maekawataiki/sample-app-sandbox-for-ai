import * as crypto from 'node:crypto';
import {
  verifyAlbJwt,
  extractUser,
  unsafeDecodeJwtPayload,
  clearKeyCache,
  _setKeyFetcher,
  _resetKeyFetcher,
} from '../src/alb-jwt';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const TEST_KID = 'test-kid-001';

function signJwt(header: object, payload: object, key: crypto.KeyObject): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signing = `${h}.${p}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signing);
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${signing}.${sig}`;
}

function makeToken(overrides: Partial<{ exp: number; signer: string; groups: string[] }> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: TEST_KID, signer: overrides.signer };
  const payload = {
    sub: 'user-sub-123',
    email: 'user@example.com',
    'cognito:groups': overrides.groups ?? ['engineering'],
    exp: overrides.exp ?? now + 3600,
  };
  return signJwt(header, payload, privateKey);
}

beforeEach(() => {
  clearKeyCache();
  _setKeyFetcher(async (_region, kid) => {
    if (kid !== TEST_KID) throw new Error(`Unknown kid: ${kid}`);
    return publicKeyPem;
  });
});

afterEach(() => {
  _resetKeyFetcher();
  clearKeyCache();
});

describe('verifyAlbJwt', () => {
  it('returns payload for a valid token', async () => {
    const token = makeToken();
    const payload = await verifyAlbJwt(token, 'ap-northeast-1');
    expect(payload.sub).toBe('user-sub-123');
    expect(payload.email).toBe('user@example.com');
  });

  it('rejects an expired token', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) - 1 });
    await expect(verifyAlbJwt(token, 'ap-northeast-1')).rejects.toThrow('expired');
  });

  it('rejects a tampered token', async () => {
    const [h, _p, s] = makeToken().split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'evil', exp: 9999999999 })).toString('base64url');
    const tampered = `${h}.${tamperedPayload}.${s}`;
    await expect(verifyAlbJwt(tampered, 'ap-northeast-1')).rejects.toThrow('verification failed');
  });

  it('rejects token from disallowed signer', async () => {
    const token = makeToken({ signer: 'arn:aws:elasticloadbalancing:us-east-1:999:loadbalancer/app/evil/abc' });
    await expect(
      verifyAlbJwt(token, 'ap-northeast-1', ['arn:aws:elasticloadbalancing:ap-northeast-1:123:loadbalancer/app/prod/xyz']),
    ).rejects.toThrow('not in the allowed ALB ARN list');
  });

  it('accepts token from allowed signer', async () => {
    const arn = 'arn:aws:elasticloadbalancing:ap-northeast-1:123:loadbalancer/app/prod/xyz';
    const token = makeToken({ signer: arn });
    const payload = await verifyAlbJwt(token, 'ap-northeast-1', [arn]);
    expect(payload.sub).toBe('user-sub-123');
  });
});

describe('extractUser', () => {
  it('extracts groups from cognito:groups claim', () => {
    const user = extractUser({ sub: 'u1', email: 'a@b.com', 'cognito:groups': ['admin'], exp: 9 });
    expect(user.groups).toEqual(['admin']);
  });

  it('falls back to access token groups when claim absent', () => {
    const accessTokenPayload = { sub: 'u1', 'cognito:groups': ['eng'] };
    const accessToken =
      Buffer.from('{}').toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify(accessTokenPayload)).toString('base64url') +
      '.sig';
    const user = extractUser({ sub: 'u1', email: 'x@y.com', exp: 9 }, accessToken);
    expect(user.groups).toEqual(['eng']);
  });

  it('uses sub as email when email claim is absent', () => {
    const user = extractUser({ sub: 'u1', exp: 9 });
    expect(user.email).toBe('u1');
  });
});

describe('unsafeDecodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { foo: 'bar' };
    const encoded =
      'header.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.sig';
    expect(unsafeDecodeJwtPayload(encoded)).toEqual(payload);
  });

  it('returns null for malformed input', () => {
    expect(unsafeDecodeJwtPayload('not.a.jwt.with.five.parts')).toBeNull();
    expect(unsafeDecodeJwtPayload('!!!')).toBeNull();
  });
});
