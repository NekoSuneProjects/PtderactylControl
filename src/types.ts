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

export type Server = {
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

export type DashboardData = {
  servers: Server[];
  users: number;
  nodes: number;
  generatedAt: string;
};

export type User = {
  id: number;
  uuid: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  root_admin: boolean;
  created_at: string;
};

export type Node = {
  id: number;
  name: string;
  fqdn: string;
  maintenance_mode: boolean;
  memory: number;
  disk: number;
};

export type Nest = { id: number; name: string; description: string };
export type EggVariable = { name: string; env_variable: string; default_value: string; user_viewable: boolean; user_editable: boolean; rules: string };
export type Egg = {
  id: number;
  name: string;
  description: string;
  docker_image: string;
  docker_images: Record<string, string> | string[];
  startup: string;
  relationships?: { variables?: { data?: Array<{ attributes: EggVariable }> } };
};
export type Allocation = { id: number; ip: string; alias?: string | null; port: number; assigned: boolean; notes?: string | null; is_default?: boolean };
export type FileItem = { name: string; mode: string; mode_bits: string; size: number; is_file: boolean; is_symlink: boolean; mimetype: string; created_at: string; modified_at: string };
export type Backup = { uuid: string; name: string; bytes: number; created_at: string; completed_at: string | null; is_successful: boolean; is_locked: boolean };
export type Activity = { id: string; event: string; is_api: boolean; ip: string | null; properties: Record<string, unknown>; timestamp: string };

export type Page = 'overview' | 'servers' | 'deploy' | 'users' | 'settings';
export type ToastData = { id: number; tone: 'success' | 'error' | 'info'; title: string; message?: string };
