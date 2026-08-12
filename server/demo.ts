import crypto from 'node:crypto';
import type { PowerSignal, ServerState, ServerSummary } from './types.js';

const MB = 1024 * 1024;
const now = Date.now();

const makeServer = (
  id: string,
  internalId: number,
  name: string,
  description: string,
  node: string,
  status: ServerState,
  address: string,
  cpu: number,
  memory: number,
  disk: number,
): ServerSummary => ({
  id,
  internalId,
  uuid: `${id}-4ff0-8d5a-${String(internalId).padStart(12, '0')}`,
  name,
  description,
  node,
  status,
  suspended: false,
  installing: false,
  address,
  limits: { memory, disk, cpu: 200 },
  usage: {
    state: status,
    memoryBytes: status === 'running' ? memory * MB * 0.64 : 0,
    memoryLimitBytes: memory * MB,
    cpuAbsolute: status === 'running' ? cpu : 0,
    cpuLimit: 200,
    diskBytes: disk * MB * 0.43,
    diskLimitBytes: disk * MB,
    networkRxBytes: status === 'running' ? 481 * MB : 0,
    networkTxBytes: status === 'running' ? 129 * MB : 0,
    uptime: status === 'running' ? 3 * 24 * 60 * 60 * 1000 + internalId * 791_000 : 0,
  },
});

export class DemoStore {
  servers: ServerSummary[] = [
    makeServer('a1b2c3d4', 1, 'Aurora Survival', 'Primary Minecraft survival world', 'London-01', 'running', 'play.neko.host:25565', 32.7, 8192, 51200),
    makeServer('f8e7d6c5', 2, 'Velocity Proxy', 'Public network gateway', 'London-01', 'running', 'proxy.neko.host:25577', 4.8, 2048, 8192),
    makeServer('b7c6d5e4', 3, 'Modded SMP', 'Create: Arcane Engineering', 'Frankfurt-02', 'offline', '135.125.74.18:25570', 0, 12288, 76800),
    makeServer('cc82ad19', 4, 'Community Discord Bot', 'Moderation and game status bot', 'London-01', 'running', '10.0.0.24:3000', 1.2, 1024, 4096),
    makeServer('9e83fd11', 5, 'Staging Valheim', 'Weekend test environment', 'Amsterdam-01', 'error', '51.91.82.41:2456', 0, 4096, 20480),
  ];

  users = [
    { id: 1, external_id: null, uuid: '917cadca-demo-user-1', username: 'admin', email: 'admin@neko.host', first_name: 'Neko', last_name: 'Admin', root_admin: true, created_at: new Date(now - 380 * 864e5).toISOString() },
    { id: 2, external_id: null, uuid: '917cadca-demo-user-2', username: 'alex', email: 'alex@example.com', first_name: 'Alex', last_name: 'Morgan', root_admin: false, created_at: new Date(now - 86 * 864e5).toISOString() },
    { id: 3, external_id: null, uuid: '917cadca-demo-user-3', username: 'sam', email: 'sam@example.com', first_name: 'Sam', last_name: 'Rivera', root_admin: false, created_at: new Date(now - 31 * 864e5).toISOString() },
  ];

  nodes = [
    { id: 1, uuid: 'node-london-01', name: 'London-01', description: 'Primary compute', location_id: 1, fqdn: 'lon01.neko.host', scheme: 'https', maintenance_mode: false, memory: 65536, memory_overallocate: 0, disk: 1000000, disk_overallocate: 0 },
    { id: 2, uuid: 'node-frankfurt-02', name: 'Frankfurt-02', description: 'EU compute', location_id: 2, fqdn: 'fra02.neko.host', scheme: 'https', maintenance_mode: false, memory: 32768, memory_overallocate: 0, disk: 500000, disk_overallocate: 0 },
    { id: 3, uuid: 'node-amsterdam-01', name: 'Amsterdam-01', description: 'Staging compute', location_id: 3, fqdn: 'ams01.neko.host', scheme: 'https', maintenance_mode: true, memory: 16384, memory_overallocate: 0, disk: 250000, disk_overallocate: 0 },
  ];

  nests = [
    { id: 1, uuid: 'nest-minecraft', author: 'support@pterodactyl.io', name: 'Minecraft', description: 'Minecraft Java and proxy servers' },
    { id: 2, uuid: 'nest-source', author: 'support@pterodactyl.io', name: 'Source Engine', description: 'Source dedicated servers' },
    { id: 3, uuid: 'nest-generic', author: 'admin@neko.host', name: 'Generic', description: 'Generic applications' },
  ];

  eggs: Record<number, any[]> = {
    1: [
      { id: 1, uuid: 'egg-paper', name: 'Paper', description: 'High performance Minecraft server', docker_image: 'ghcr.io/pterodactyl/yolks:java_21', docker_images: { 'Java 21': 'ghcr.io/pterodactyl/yolks:java_21' }, startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', relationships: { variables: { data: [{ attributes: { name: 'Server Jar File', env_variable: 'SERVER_JARFILE', default_value: 'server.jar', user_viewable: true, user_editable: true, rules: 'required|string|max:20' } }] } } },
      { id: 2, uuid: 'egg-velocity', name: 'Velocity', description: 'Modern Minecraft proxy', docker_image: 'ghcr.io/pterodactyl/yolks:java_21', docker_images: { 'Java 21': 'ghcr.io/pterodactyl/yolks:java_21' }, startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', relationships: { variables: { data: [] } } },
    ],
    2: [{ id: 3, uuid: 'egg-source', name: 'Source Dedicated Server', description: 'SteamCMD Source server', docker_image: 'ghcr.io/pterodactyl/games:source', docker_images: { Source: 'ghcr.io/pterodactyl/games:source' }, startup: './srcds_run -game {{SRCDS_GAME}}', relationships: { variables: { data: [] } } }],
    3: [{ id: 4, uuid: 'egg-node', name: 'Node.js', description: 'Generic Node.js application', docker_image: 'ghcr.io/pterodactyl/yolks:nodejs_22', docker_images: { 'Node 22': 'ghcr.io/pterodactyl/yolks:nodejs_22' }, startup: 'npm start', relationships: { variables: { data: [] } } }],
  };

  allocations: Record<number, any[]> = {
    1: [
      { id: 1, ip: '10.0.0.21', alias: 'play.neko.host', port: 25565, assigned: true, notes: null },
      { id: 6, ip: '10.0.0.21', alias: 'play.neko.host', port: 25566, assigned: false, notes: 'Spare Minecraft' },
      { id: 7, ip: '10.0.0.21', alias: null, port: 3001, assigned: false, notes: 'Application' },
    ],
    2: [{ id: 3, ip: '10.0.1.18', alias: null, port: 25570, assigned: true, notes: null }, { id: 8, ip: '10.0.1.18', alias: null, port: 25571, assigned: false, notes: null }],
    3: [{ id: 5, ip: '10.0.2.14', alias: null, port: 2456, assigned: true, notes: null }, { id: 9, ip: '10.0.2.14', alias: null, port: 2457, assigned: false, notes: null }],
  };

  files = [
    { name: 'logs', mode: '-rw-r--r--', mode_bits: '0644', size: 4096, is_file: false, is_symlink: false, mimetype: 'inode/directory', created_at: new Date(now - 12 * 864e5).toISOString(), modified_at: new Date(now - 2 * 3600e3).toISOString() },
    { name: 'plugins', mode: '-rw-r--r--', mode_bits: '0644', size: 4096, is_file: false, is_symlink: false, mimetype: 'inode/directory', created_at: new Date(now - 12 * 864e5).toISOString(), modified_at: new Date(now - 864e5).toISOString() },
    { name: 'server.properties', mode: '-rw-r--r--', mode_bits: '0644', size: 1428, is_file: true, is_symlink: false, mimetype: 'text/plain', created_at: new Date(now - 12 * 864e5).toISOString(), modified_at: new Date(now - 3 * 3600e3).toISOString() },
    { name: 'paper-global.yml', mode: '-rw-r--r--', mode_bits: '0644', size: 8756, is_file: true, is_symlink: false, mimetype: 'text/yaml', created_at: new Date(now - 12 * 864e5).toISOString(), modified_at: new Date(now - 864e5).toISOString() },
    { name: 'server.jar', mode: '-rw-r--r--', mode_bits: '0644', size: 48_320_944, is_file: true, is_symlink: false, mimetype: 'application/java-archive', created_at: new Date(now - 12 * 864e5).toISOString(), modified_at: new Date(now - 5 * 864e5).toISOString() },
  ];

  backups = [
    { uuid: '79a6a0ef-demo-backup', name: 'Nightly — 12 Aug', ignored_files: [], sha256_hash: 'bd14a73f68e5', bytes: 8_913_481_744, created_at: new Date(now - 5 * 3600e3).toISOString(), completed_at: new Date(now - 4.8 * 3600e3).toISOString(), is_successful: true, is_locked: true },
    { uuid: 'd5123b9c-demo-backup', name: 'Before 1.21.8 update', ignored_files: [], sha256_hash: '09ac7ec36def', bytes: 8_704_581_632, created_at: new Date(now - 3 * 864e5).toISOString(), completed_at: new Date(now - 3 * 864e5 + 18e4).toISOString(), is_successful: true, is_locked: false },
  ];

  activity = [
    { id: 'act-1', event: 'server:power.start', is_api: true, ip: '127.0.0.1', description: null, properties: {}, timestamp: new Date(now - 8 * 60e3).toISOString() },
    { id: 'act-2', event: 'server:console.command', is_api: true, ip: '127.0.0.1', description: null, properties: { command: 'say Welcome to Aurora!' }, timestamp: new Date(now - 46 * 60e3).toISOString() },
    { id: 'act-3', event: 'server:backup.complete', is_api: false, ip: null, description: null, properties: { name: 'Nightly — 12 Aug' }, timestamp: new Date(now - 5 * 3600e3).toISOString() },
  ];

  findServer(id: string) {
    return this.servers.find((server) => server.id === id || String(server.internalId) === id);
  }

  power(id: string, signal: PowerSignal) {
    const server = this.findServer(id);
    if (!server) return false;
    const state: ServerState = signal === 'start' || signal === 'restart' ? 'running' : 'offline';
    server.status = state;
    server.usage.state = state;
    server.usage.uptime = state === 'running' ? 8_000 : 0;
    this.activity.unshift({ id: crypto.randomUUID(), event: `server:power.${signal}`, is_api: true, ip: '127.0.0.1', description: null, properties: {}, timestamp: new Date().toISOString() });
    return true;
  }

  createServer(input: any) {
    const internalId = Math.max(...this.servers.map((item) => item.internalId ?? 0)) + 1;
    const id = crypto.randomBytes(4).toString('hex');
    const allocation = Object.values(this.allocations).flat().find((item) => item.id === Number(input?.allocation?.default));
    if (allocation) allocation.assigned = true;
    const server = makeServer(
      id, internalId, input.name, input.description ?? '',
      this.nodes.find((node) => node.id === Number(input.node))?.name ?? 'Auto deployed',
      input.start_on_completion ? 'starting' : 'offline',
      allocation ? `${allocation.alias || allocation.ip}:${allocation.port}` : 'Pending allocation',
      0, Number(input.limits?.memory || 1024), Number(input.limits?.disk || 10240),
    );
    this.servers.unshift(server);
    return server;
  }
}
