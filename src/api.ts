import type { Activity, Allocation, Backup, DashboardData, Egg, FileItem, Node, Nest, ResourceStats, Server, User } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string[]>) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error || `Request failed (${response.status})`, response.status, payload.fields);
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  return (contentType.includes('application/json') ? response.json() : response.text()) as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  session: () => request<{ authenticated: boolean; passwordRequired: boolean }>('/api/auth/session'),
  login: (password: string) => request<{ authenticated: boolean }>('/api/auth/login', json('POST', { password })),
  logout: () => request<void>('/api/auth/logout', json('POST')),
  health: () => request<{ ok: boolean; mode: 'demo' | 'live'; configured: boolean }>('/api/health'),
  config: () => request<{ mode: 'demo' | 'live'; panelUrl: string; clientApi: boolean; applicationApi: boolean; passwordProtected: boolean }>('/api/config'),
  dashboard: () => request<DashboardData>('/api/dashboard'),
  servers: () => request<Server[]>('/api/servers'),
  server: (id: string) => request<Server>(`/api/servers/${encodeURIComponent(id)}`),
  resources: (id: string) => request<ResourceStats>(`/api/servers/${encodeURIComponent(id)}/resources`),
  power: (id: string, signal: 'start' | 'stop' | 'restart' | 'kill') => request<void>(`/api/servers/${encodeURIComponent(id)}/power`, json('POST', { signal })),
  command: (id: string, command: string) => request<void>(`/api/servers/${encodeURIComponent(id)}/command`, json('POST', { command })),
  websocket: (id: string) => request<{ token?: string; socket?: string; demo?: boolean }>(`/api/servers/${encodeURIComponent(id)}/websocket`),
  files: (id: string, directory: string) => request<FileItem[]>(`/api/servers/${encodeURIComponent(id)}/files?directory=${encodeURIComponent(directory)}`),
  file: (id: string, file: string) => request<string>(`/api/servers/${encodeURIComponent(id)}/files/contents?file=${encodeURIComponent(file)}`),
  writeFile: (id: string, file: string, content: string) => request<void>(`/api/servers/${encodeURIComponent(id)}/files/write`, json('POST', { file, content })),
  backups: (id: string) => request<Backup[]>(`/api/servers/${encodeURIComponent(id)}/backups`),
  createBackup: (id: string, name: string) => request<Backup>(`/api/servers/${encodeURIComponent(id)}/backups`, json('POST', { name })),
  deleteBackup: (id: string, uuid: string) => request<void>(`/api/servers/${encodeURIComponent(id)}/backups/${encodeURIComponent(uuid)}`, { method: 'DELETE' }),
  network: (id: string) => request<Allocation[]>(`/api/servers/${encodeURIComponent(id)}/network`),
  activity: (id: string) => request<Activity[]>(`/api/servers/${encodeURIComponent(id)}/activity`),
  rename: (id: string, name: string) => request<void>(`/api/servers/${encodeURIComponent(id)}/rename`, json('POST', { name })),
  reinstall: (id: string) => request<void>(`/api/servers/${encodeURIComponent(id)}/reinstall`, json('POST')),
  catalog: () => request<{ users: User[]; nodes: Node[]; nests: Nest[] }>('/api/admin/catalog'),
  eggs: (nest: number) => request<Egg[]>(`/api/admin/nests/${nest}/eggs`),
  egg: (nest: number, egg: number) => request<Egg>(`/api/admin/nests/${nest}/eggs/${egg}`),
  allocations: (node: number) => request<Allocation[]>(`/api/admin/nodes/${node}/allocations`),
  createServer: (data: unknown) => request<Server>('/api/admin/servers', json('POST', data)),
  adminAction: (id: number, action: 'suspend' | 'unsuspend' | 'reinstall') => request<void>(`/api/admin/servers/${id}/${action}`, json('POST')),
  deleteServer: (id: number, force = false) => request<void>(`/api/admin/servers/${id}?force=${force}`, { method: 'DELETE' }),
  users: () => request<User[]>('/api/admin/users'),
  createUser: (data: unknown) => request<User>('/api/admin/users', json('POST', data)),
};
