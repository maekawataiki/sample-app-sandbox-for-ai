import express from 'express';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createCedarAuth } from '../src/middleware';

async function request(
  baseUrl: string,
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, { method, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function listenAsync(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function closeAsync(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe('createCedarAuth — dev mode', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(
      createCedarAuth({
        devMode: true,
        devUser: { sub: 'dev', email: 'dev@local', groups: ['engineering'] },
        serviceName: 'test-svc',
        watchPolicies: false,
      }),
    );
    app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
    app.get('/', (req, res) => res.json({ user: req.cedarUser }));
    server = createServer(app);
    baseUrl = await listenAsync(server);
  });

  afterAll(async () => {
    if (server) await closeAsync(server);
  });

  it('/healthz bypasses Cedar (200 with no auth headers)', async () => {
    const { status } = await request(baseUrl, '/healthz');
    expect(status).toBe(200);
  });

  it('/ returns 200 and attaches cedarUser', async () => {
    const { status, body } = await request(baseUrl, '/');
    expect(status).toBe(200);
    expect((body as { user: { email: string } }).user.email).toBe('dev@local');
  });
});

describe('createCedarAuth — no auth header (non-dev)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(
      createCedarAuth({
        serviceName: 'test-svc',
        devMode: false,
        watchPolicies: false,
      }),
    );
    app.get('/', (_req, res) => res.json({ ok: true }));
    server = createServer(app);
    baseUrl = await listenAsync(server);
  });

  afterAll(async () => {
    if (server) await closeAsync(server);
  });

  it('returns 401 when x-amzn-oidc-data header is missing', async () => {
    const { status } = await request(baseUrl, '/');
    expect(status).toBe(401);
  });
});
