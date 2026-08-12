import type { AppConfig } from './config.js';
import type { ApiCollection, ResourceStats, ServerState, ServerSummary } from './types.js';

type ApiScope = 'client' | 'application';
type RequestOptions = {
  method?: string;
  body?: unknown;
  rawBody?: string;
  query?: Record<string, string | number | boolean | undefined>;
  raw?: boolean;
};

export class PterodactylApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PterodactylApiError';
  }
}

const asAttributes = <T>(item: { attributes?: T } | T): T =>
  item && typeof item === 'object' && 'attributes' in item ? (item as { attributes: T }).attributes : (item as T);

export const collectionAttributes = <T>(payload: ApiCollection<T> | undefined): T[] =>
  Array.isArray(payload?.data) ? payload.data.map(asAttributes) : [];

function stateOf(value: unknown): ServerState {
  return ['running', 'offline', 'starting', 'stopping'].includes(String(value))
    ? (value as ServerState)
    : 'error';
}

function allocationAddress(server: any): string {
  const allocations = server?.relationships?.allocations?.data ?? [];
  const primary = allocations.map(asAttributes<any>).find((item: any) => item.is_default) ?? asAttributes<any>(allocations[0] ?? {});
  return primary?.alias
    ? `${primary.alias}:${primary.port ?? ''}`
    : primary?.ip
      ? `${primary.ip}:${primary.port ?? ''}`
      : 'No allocation';
}

export class PterodactylClient {
  constructor(private readonly config: AppConfig) {}

  async request<T>(scope: ApiScope, path: string, options: RequestOptions = {}): Promise<T> {
    const key = scope === 'client' ? this.config.clientKey : this.config.applicationKey;
    if (!this.config.panelUrl || !key) {
      throw new PterodactylApiError(`The ${scope} API is not configured.`, 503);
    }

    const url = new URL(`/api/${scope}${path.startsWith('/') ? path : `/${path}`}`, `${this.config.panelUrl}/`);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'Application/vnd.pterodactyl.v1+json',
          Authorization: `Bearer ${key}`,
          ...(options.rawBody !== undefined ? { 'Content-Type': 'text/plain' } : options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.rawBody !== undefined ? options.rawBody : options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed';
      throw new PterodactylApiError(`Could not reach the Pterodactyl panel: ${message}`, 502);
    }

    const text = await response.text();
    let payload: any = undefined;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const panelMessage = payload?.errors?.map((item: any) => item?.detail).filter(Boolean).join(' ') ||
        payload?.message || response.statusText || 'Pterodactyl request failed';
      throw new PterodactylApiError(panelMessage, response.status, payload);
    }

    return payload as T;
  }

  client<T>(path: string, options?: RequestOptions) {
    return this.request<T>('client', path, options);
  }

  application<T>(path: string, options?: RequestOptions) {
    return this.request<T>('application', path, options);
  }

  async resources(identifier: string): Promise<ResourceStats> {
    const payload = await this.client<any>(`/servers/${encodeURIComponent(identifier)}/resources`);
    const attributes = asAttributes<any>(payload);
    const resources = attributes.resources ?? {};
    return {
      state: stateOf(attributes.current_state),
      memoryBytes: resources.memory_bytes ?? 0,
      memoryLimitBytes: 0,
      cpuAbsolute: resources.cpu_absolute ?? 0,
      cpuLimit: 0,
      diskBytes: resources.disk_bytes ?? 0,
      diskLimitBytes: 0,
      networkRxBytes: resources.network_rx_bytes ?? 0,
      networkTxBytes: resources.network_tx_bytes ?? 0,
      uptime: resources.uptime ?? 0,
    };
  }

  async servers(): Promise<ServerSummary[]> {
    const [clientPayload, appPayload] = await Promise.all([
      this.client<ApiCollection<any>>('/', {
        query: { include: 'allocations', filter: 'all', per_page: 100 },
      }),
      this.application<ApiCollection<any>>('/servers', { query: { per_page: 100 } }).catch(() => undefined),
    ]);
    const adminServers = new Map(
      collectionAttributes<any>(appPayload).map((server) => [server.uuid, server]),
    );

    const clientServers = collectionAttributes<any>(clientPayload);
    return Promise.all(clientServers.map(async (server) => {
      const limits = server.limits ?? {};
      let usage: ResourceStats;
      try {
        usage = await this.resources(server.identifier);
      } catch {
        usage = {
          state: server.is_suspended ? 'offline' : 'error', memoryBytes: 0, memoryLimitBytes: 0,
          cpuAbsolute: 0, cpuLimit: 0, diskBytes: 0, diskLimitBytes: 0,
          networkRxBytes: 0, networkTxBytes: 0, uptime: 0,
        };
      }
      usage.memoryLimitBytes = (limits.memory ?? 0) * 1024 * 1024;
      usage.diskLimitBytes = (limits.disk ?? 0) * 1024 * 1024;
      usage.cpuLimit = limits.cpu ?? 0;
      const admin = adminServers.get(server.uuid);
      return {
        id: server.identifier,
        internalId: admin?.id ?? server.internal_id,
        uuid: server.uuid,
        name: server.name,
        description: server.description ?? '',
        node: server.node ?? admin?.node ?? 'Unknown node',
        status: usage.state,
        suspended: Boolean(server.is_suspended ?? admin?.suspended),
        installing: Boolean(server.is_installing ?? admin?.installing),
        address: allocationAddress(server),
        limits: { memory: limits.memory ?? 0, disk: limits.disk ?? 0, cpu: limits.cpu ?? 0 },
        usage,
      } satisfies ServerSummary;
    }));
  }
}
