import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Server as HttpServer } from 'node:http';
import cookieParser from 'cookie-parser';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { clearSessionCookie, isSessionValid, passwordMatches, requireAuth, sessionCookieName, setSessionCookie } from './auth.js';
import { getConfig, type AppConfig } from './config.js';
import { DemoStore } from './demo.js';
import { collectionAttributes, PterodactylApiError, PterodactylClient } from './pterodactyl.js';

const powerSchema = z.object({ signal: z.enum(['start', 'stop', 'restart', 'kill']) });
const commandSchema = z.object({ command: z.string().trim().min(1).max(1000) });
const serverSchema = z.object({
  name: z.string().trim().min(1).max(191),
  description: z.string().max(65535).optional().default(''),
  user: z.coerce.number().int().positive(),
  egg: z.coerce.number().int().positive(),
  node: z.coerce.number().int().positive().optional(),
  docker_image: z.string().min(1),
  startup: z.string().min(1),
  environment: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  limits: z.object({
    memory: z.coerce.number().int().nonnegative(), swap: z.coerce.number().int(),
    disk: z.coerce.number().int().nonnegative(), io: z.coerce.number().int().min(10).max(1000),
    cpu: z.coerce.number().int().nonnegative(),
  }),
  feature_limits: z.object({
    databases: z.coerce.number().int().nonnegative(), allocations: z.coerce.number().int().nonnegative(), backups: z.coerce.number().int().nonnegative(),
  }),
  allocation: z.object({ default: z.coerce.number().int().positive() }),
  start_on_completion: z.boolean().optional().default(true),
});

const userSchema = z.object({
  email: z.string().email(), username: z.string().min(1).max(191),
  first_name: z.string().min(1).max(191), last_name: z.string().min(1).max(191),
  password: z.string().min(8).optional(), root_admin: z.boolean().optional().default(false),
});

const asyncRoute = (handler: (request: Request, response: Response) => Promise<unknown>) =>
  (request: Request, response: Response, next: (error?: unknown) => void) => void handler(request, response).catch(next);

const attrs = (payload: any) => payload?.attributes ?? payload;
const collection = (payload: any) => collectionAttributes<any>(payload);
const routeParam = (request: Request, name: string) => String(request.params[name]);

export function createApp(config: AppConfig = getConfig(), staticDir = path.resolve('dist')) {
  const app = express();
  const ptero = new PterodactylClient(config);
  const demo = new DemoStore();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, mode: config.demoMode ? 'demo' : 'live', configured: Boolean(config.panelUrl && config.clientKey) });
  });

  app.get('/api/auth/session', (request, response) => {
    response.json({ authenticated: isSessionValid(request.cookies?.[sessionCookieName], config), passwordRequired: Boolean(config.password) });
  });
  app.post('/api/auth/login', (request, response) => {
    if (!config.password || passwordMatches(String(request.body?.password ?? ''), config)) {
      setSessionCookie(response, config);
      return response.json({ authenticated: true });
    }
    return response.status(401).json({ error: 'That password is not correct.' });
  });
  app.post('/api/auth/logout', (_request, response) => {
    clearSessionCookie(response, config);
    response.status(204).end();
  });

  app.use('/api', requireAuth(config));

  app.get('/api/config', (_request, response) => {
    response.json({
      mode: config.demoMode ? 'demo' : 'live',
      panelUrl: config.panelUrl || 'Not configured',
      clientApi: Boolean(config.clientKey),
      applicationApi: Boolean(config.applicationKey),
      passwordProtected: Boolean(config.password),
    });
  });

  app.get('/api/dashboard', asyncRoute(async (_request, response) => {
    const servers = config.demoMode ? demo.servers : await ptero.servers();
    let users = demo.users.length;
    let nodes = demo.nodes.length;
    if (!config.demoMode) {
      const [userPayload, nodePayload] = await Promise.all([
        ptero.application<any>('/users', { query: { per_page: 1 } }).catch(() => undefined),
        ptero.application<any>('/nodes', { query: { per_page: 1 } }).catch(() => undefined),
      ]);
      users = userPayload?.meta?.pagination?.total ?? 0;
      nodes = nodePayload?.meta?.pagination?.total ?? 0;
    }
    response.json({ servers, users, nodes, generatedAt: new Date().toISOString() });
  }));

  app.get('/api/servers', asyncRoute(async (_request, response) => {
    response.json(config.demoMode ? demo.servers : await ptero.servers());
  }));

  app.get('/api/servers/:server', asyncRoute(async (request, response) => {
    if (config.demoMode) {
      const server = demo.findServer(routeParam(request, 'server'));
      return server ? response.json(server) : response.status(404).json({ error: 'Server not found.' });
    }
    const [serverPayload, resources] = await Promise.all([
      ptero.client<any>(`/servers/${encodeURIComponent(routeParam(request, 'server'))}`, { query: { include: 'allocations' } }),
      ptero.resources(routeParam(request, 'server')),
    ]);
    response.json({ ...attrs(serverPayload), resources });
  }));

  app.get('/api/servers/:server/resources', asyncRoute(async (request, response) => {
    if (config.demoMode) {
      const server = demo.findServer(routeParam(request, 'server'));
      return server ? response.json(server.usage) : response.status(404).json({ error: 'Server not found.' });
    }
    response.json(await ptero.resources(routeParam(request, 'server')));
  }));

  app.post('/api/servers/:server/power', asyncRoute(async (request, response) => {
    const body = powerSchema.parse(request.body);
    if (config.demoMode) {
      return demo.power(routeParam(request, 'server'), body.signal)
        ? response.status(204).end()
        : response.status(404).json({ error: 'Server not found.' });
    }
    await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/power`, { method: 'POST', body });
    response.status(204).end();
  }));

  app.post('/api/servers/:server/command', asyncRoute(async (request, response) => {
    const body = commandSchema.parse(request.body);
    if (!config.demoMode) await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/command`, { method: 'POST', body });
    response.status(204).end();
  }));

  app.get('/api/servers/:server/websocket', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.json({ demo: true });
    response.json(attrs(await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/websocket`)));
  }));

  app.get('/api/servers/:server/files', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.json(request.query.directory === '/' || !request.query.directory ? demo.files : []);
    const payload = await ptero.client<any>(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/files/list`, { query: { directory: String(request.query.directory || '/') } });
    response.json(collection(payload));
  }));

  app.get('/api/servers/:server/files/contents', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.type('text/plain').send('# PteroControl demo file\nmotd=A server controlled from anywhere\nmax-players=24\nonline-mode=true\n');
    const contents = await ptero.client<string>(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/files/contents`, { query: { file: String(request.query.file || '') } });
    response.type('text/plain').send(contents);
  }));

  app.post('/api/servers/:server/files/write', asyncRoute(async (request, response) => {
    const body = z.object({ file: z.string().min(1), content: z.string().max(2_000_000) }).parse(request.body);
    if (!config.demoMode) await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/files/write`, { method: 'POST', query: { file: body.file }, rawBody: body.content });
    response.status(204).end();
  }));

  app.get('/api/servers/:server/backups', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.json(demo.backups);
    response.json(collection(await ptero.client<any>(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/backups`)));
  }));

  app.post('/api/servers/:server/backups', asyncRoute(async (request, response) => {
    const body = z.object({ name: z.string().max(191).optional(), ignored: z.string().max(5000).optional() }).parse(request.body);
    if (config.demoMode) {
      const backup = { uuid: crypto.randomUUID(), name: body.name || 'Manual backup', ignored_files: body.ignored?.split('\n') ?? [], sha256_hash: null, bytes: 0, created_at: new Date().toISOString(), completed_at: null, is_successful: true, is_locked: false };
      demo.backups.unshift(backup as any);
      return response.status(201).json(backup);
    }
    response.status(201).json(attrs(await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/backups`, { method: 'POST', body })));
  }));

  app.delete('/api/servers/:server/backups/:backup', asyncRoute(async (request, response) => {
    if (config.demoMode) demo.backups = demo.backups.filter((item) => item.uuid !== routeParam(request, 'backup'));
    else await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/backups/${encodeURIComponent(routeParam(request, 'backup'))}`, { method: 'DELETE' });
    response.status(204).end();
  }));

  app.get('/api/servers/:server/network', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.json(demo.allocations[1] ?? []);
    response.json(collection(await ptero.client<any>(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/network/allocations`)));
  }));

  app.get('/api/servers/:server/activity', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.json(demo.activity);
    response.json(collection(await ptero.client<any>(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/activity`)));
  }));

  app.post('/api/servers/:server/rename', asyncRoute(async (request, response) => {
    const body = z.object({ name: z.string().trim().min(1).max(191) }).parse(request.body);
    if (config.demoMode) {
      const server = demo.findServer(routeParam(request, 'server'));
      if (server) server.name = body.name;
    } else await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/settings/rename`, { method: 'POST', body });
    response.status(204).end();
  }));

  app.post('/api/servers/:server/reinstall', asyncRoute(async (request, response) => {
    if (!config.demoMode) await ptero.client(`/servers/${encodeURIComponent(routeParam(request, 'server'))}/settings/reinstall`, { method: 'POST' });
    response.status(204).end();
  }));

  app.get('/api/admin/catalog', asyncRoute(async (_request, response) => {
    if (config.demoMode) return response.json({ users: demo.users, nodes: demo.nodes, nests: demo.nests });
    const [users, nodes, nests] = await Promise.all([
      ptero.application<any>('/users', { query: { per_page: 100 } }),
      ptero.application<any>('/nodes', { query: { per_page: 100 } }),
      ptero.application<any>('/nests', { query: { per_page: 100 } }),
    ]);
    response.json({ users: collection(users), nodes: collection(nodes), nests: collection(nests) });
  }));

  app.get('/api/admin/nests/:nest/eggs', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.json(demo.eggs[Number(request.params.nest)] ?? []);
    response.json(collection(await ptero.application<any>(`/nests/${request.params.nest}/eggs`, { query: { include: 'variables', per_page: 100 } })));
  }));

  app.get('/api/admin/nests/:nest/eggs/:egg', asyncRoute(async (request, response) => {
    if (config.demoMode) {
      const egg = (demo.eggs[Number(request.params.nest)] ?? []).find((item) => item.id === Number(request.params.egg));
      return egg ? response.json(egg) : response.status(404).json({ error: 'Egg not found.' });
    }
    response.json(attrs(await ptero.application<any>(`/nests/${request.params.nest}/eggs/${request.params.egg}`, { query: { include: 'variables' } })));
  }));

  app.get('/api/admin/nodes/:node/allocations', asyncRoute(async (request, response) => {
    if (config.demoMode) return response.json(demo.allocations[Number(request.params.node)] ?? []);
    response.json(collection(await ptero.application<any>(`/nodes/${request.params.node}/allocations`, { query: { per_page: 100 } })));
  }));

  app.post('/api/admin/servers', asyncRoute(async (request, response) => {
    const body = serverSchema.parse(request.body);
    if (config.demoMode) return response.status(201).json(demo.createServer(body));
    response.status(201).json(attrs(await ptero.application('/servers', { method: 'POST', body })));
  }));

  app.post('/api/admin/servers/:server/:action', asyncRoute(async (request, response) => {
    const action = z.enum(['suspend', 'unsuspend', 'reinstall']).parse(request.params.action);
    if (config.demoMode) {
      const server = demo.findServer(routeParam(request, 'server'));
      if (server && action !== 'reinstall') server.suspended = action === 'suspend';
    } else await ptero.application(`/servers/${routeParam(request, 'server')}/${action}`, { method: 'POST' });
    response.status(204).end();
  }));

  app.delete('/api/admin/servers/:server', asyncRoute(async (request, response) => {
    if (config.demoMode) demo.servers = demo.servers.filter((server) => String(server.internalId) !== request.params.server);
    else await ptero.application(`/servers/${request.params.server}${request.query.force === 'true' ? '/force' : ''}`, { method: 'DELETE' });
    response.status(204).end();
  }));

  app.get('/api/admin/users', asyncRoute(async (_request, response) => {
    if (config.demoMode) return response.json(demo.users);
    response.json(collection(await ptero.application<any>('/users', { query: { per_page: 100 } })));
  }));

  app.post('/api/admin/users', asyncRoute(async (request, response) => {
    const body = userSchema.parse(request.body);
    if (config.demoMode) {
      const user = { id: demo.users.length + 1, uuid: crypto.randomUUID(), external_id: null, created_at: new Date().toISOString(), ...body };
      demo.users.push(user as any);
      return response.status(201).json(user);
    }
    response.status(201).json(attrs(await ptero.application('/users', { method: 'POST', body })));
  }));

  app.use(express.static(staticDir));
  app.get('*splat', (_request, response) => response.sendFile(path.join(staticDir, 'index.html')));

  app.use((error: unknown, _request: Request, response: Response, _next: unknown) => {
    if (error instanceof z.ZodError) {
      return response.status(400).json({ error: 'Please check the form values.', fields: error.flatten().fieldErrors });
    }
    if (error instanceof PterodactylApiError) {
      return response.status(error.status >= 400 && error.status < 600 ? error.status : 502).json({ error: error.message });
    }
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    response.status(500).json({ error: message });
  });

  return app;
}

export function startServer(options: { port?: number; staticDir?: string; config?: AppConfig } = {}): Promise<{ server: HttpServer; port: number }> {
  const config = options.config ?? getConfig();
  const app = createApp(config, options.staticDir);
  return new Promise((resolve) => {
    const server = app.listen(options.port ?? config.port, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : config.port;
      resolve({ server, port });
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const config = getConfig();
  createApp(config).listen(config.port, '0.0.0.0', () => {
    console.log(`PteroControl API listening on http://localhost:${config.port} (${config.demoMode ? 'demo' : 'live'} mode)`);
  });
}
