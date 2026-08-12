export type PowerSignal = 'start' | 'stop' | 'restart' | 'kill';
export type ServerState = 'running' | 'offline' | 'starting' | 'stopping' | 'error';

export type ResourceStats = {
  state: ServerState;
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  cpuLimit: number;
  diskBytes: number;
  diskLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptime: number;
};

export type ServerSummary = {
  id: string;
  internalId?: number;
  uuid: string;
  name: string;
  description: string;
  node: string;
  status: ServerState;
  suspended: boolean;
  installing: boolean;
  address: string;
  limits: { memory: number; disk: number; cpu: number };
  usage: ResourceStats;
};

export type ApiCollection<T = unknown> = {
  object?: string;
  data: Array<{ object?: string; attributes: T }>;
  meta?: { pagination?: Record<string, number> };
};
