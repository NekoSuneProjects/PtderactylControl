import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';
import type { AppConfig } from './config.js';

const config: AppConfig = {
  port: 0,
  panelUrl: '',
  clientKey: '',
  applicationKey: '',
  password: '',
  sessionSecret: 'test-secret-at-least-thirty-two-characters',
  demoMode: true,
  production: false,
};

describe('PteroControl API', () => {
  it('reports demo health and serves the dashboard', async () => {
    const app = createApp(config);
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toMatchObject({ ok: true, mode: 'demo' });

    const dashboard = await request(app).get('/api/dashboard').expect(200);
    expect(dashboard.body.servers).toHaveLength(5);
    expect(dashboard.body.servers[0]).toMatchObject({ name: 'Aurora Survival', status: 'running' });
  });

  it('changes power state and accepts console commands', async () => {
    const app = createApp(config);
    await request(app).post('/api/servers/b7c6d5e4/power').send({ signal: 'start' }).expect(204);
    const resources = await request(app).get('/api/servers/b7c6d5e4/resources').expect(200);
    expect(resources.body.state).toBe('running');
    await request(app).post('/api/servers/b7c6d5e4/command').send({ command: 'say hello' }).expect(204);
  });

  it('validates and creates a server', async () => {
    const app = createApp(config);
    const invalid = await request(app).post('/api/admin/servers').send({ name: '' }).expect(400);
    expect(invalid.body.error).toContain('check');

    const created = await request(app).post('/api/admin/servers').send({
      name: 'Test Server', description: 'Automated test', user: 1, egg: 1, node: 1,
      docker_image: 'ghcr.io/pterodactyl/yolks:java_21', startup: 'java -jar server.jar', environment: {},
      limits: { memory: 1024, swap: 0, disk: 4096, io: 500, cpu: 100 },
      feature_limits: { databases: 1, allocations: 1, backups: 1 },
      allocation: { default: 6 }, start_on_completion: true,
    }).expect(201);
    expect(created.body).toMatchObject({ name: 'Test Server', status: 'starting' });
  });

  it('enforces the dashboard password when configured', async () => {
    const protectedApp = createApp({ ...config, password: 'strong-password' });
    await request(protectedApp).get('/api/dashboard').expect(401);
    await request(protectedApp).post('/api/auth/login').send({ password: 'wrong' }).expect(401);
    const agent = request.agent(protectedApp);
    await agent.post('/api/auth/login').send({ password: 'strong-password' }).expect(200);
    await agent.get('/api/dashboard').expect(200);
  });
});
