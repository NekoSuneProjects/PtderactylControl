#!/usr/bin/env node
import fs from 'node:fs/promises';
import { getConfig } from './config.js';
import { collectionAttributes, PterodactylApiError, PterodactylClient } from './pterodactyl.js';
import type { PowerSignal, ServerSummary } from './types.js';

const config = getConfig();
const client = new PterodactylClient(config);
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const cleanArgs = args.filter((arg) => arg !== '--json');
const [command = 'help', ...parameters] = cleanArgs;
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const color = (code: number, value: string) => useColor ? `\u001b[${code}m${value}\u001b[0m` : value;
const teal = (value: string) => color(36, value);
const red = (value: string) => color(31, value);
const dim = (value: string) => color(2, value);

function printHelp() {
  console.log(`
${teal('PteroControl CLI')} — control Pterodactyl without a browser

Usage: pteroctl <command> [arguments] [--json]

  health                         Test the panel connection
  servers                        List servers and live status
  status <server>                Show detailed resource usage
  start <server>                 Start a server
  stop <server>                  Gracefully stop a server
  restart <server>               Restart a server
  kill <server>                  Force-stop a server
  command <server> <text...>     Send a console command
  users                          List panel users
  create --file <config.json>    Create a server from JSON
  config                         Show active configuration (keys hidden)
  help                           Show this help

The server argument is the short identifier shown by the Client API.
Configuration is read from the same .env file as the desktop/web app.
`);
}

function bytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function row(values: string[], widths: number[]) {
  return values.map((value, index) => value.length > widths[index] ? `${value.slice(0, widths[index] - 1)}…` : value.padEnd(widths[index])).join('  ');
}

function output(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

async function servers() {
  if (config.demoMode) throw new Error('CLI live commands require PTERODACTYL_URL and PTERODACTYL_CLIENT_API_KEY.');
  return client.servers();
}

async function findServer(id: string): Promise<ServerSummary> {
  const server = (await servers()).find((item) => item.id === id || item.uuid === id || String(item.internalId) === id);
  if (!server) throw new Error(`Server "${id}" was not found.`);
  return server;
}

async function power(signal: PowerSignal, id?: string) {
  if (!id) throw new Error(`${signal} requires a server identifier.`);
  const server = await findServer(id);
  await client.client(`/servers/${server.id}/power`, { method: 'POST', body: { signal } });
  if (jsonOutput) output({ ok: true, server: server.id, signal });
  else console.log(`${teal('✓')} ${signal} signal sent to ${server.name} (${server.id})`);
}

async function main() {
  switch (command) {
    case 'help': case '--help': case '-h': return printHelp();
    case 'config': {
      const value = { mode: config.demoMode ? 'demo' : 'live', panelUrl: config.panelUrl || null, clientApiKey: config.clientKey ? 'configured' : 'missing', applicationApiKey: config.applicationKey ? 'configured' : 'missing' };
      if (jsonOutput) return output(value);
      console.log(`${teal('Mode')}             ${value.mode}\n${teal('Panel URL')}        ${value.panelUrl ?? dim('not configured')}\n${teal('Client API')}       ${value.clientApiKey}\n${teal('Application API')}  ${value.applicationApiKey}`);
      return;
    }
    case 'health': {
      if (config.demoMode) throw new Error('Panel credentials are not configured. Copy .env.example to .env first.');
      const started = performance.now();
      const payload = await client.client<any>('/account');
      const elapsed = Math.round(performance.now() - started);
      const account = payload?.attributes ?? payload;
      const value = { ok: true, latencyMs: elapsed, panel: config.panelUrl, user: account?.email ?? account?.username ?? 'authenticated' };
      if (jsonOutput) return output(value);
      console.log(`${teal('✓ Connected')} to ${config.panelUrl} in ${elapsed}ms as ${value.user}`);
      return;
    }
    case 'servers': {
      const items = await servers();
      if (jsonOutput) return output(items);
      const widths = [10, 28, 12, 10, 12, 20];
      console.log(row(['ID', 'NAME', 'STATE', 'CPU', 'MEMORY', 'NODE'], widths));
      console.log(dim('─'.repeat(widths.reduce((sum, width) => sum + width + 2, -2))));
      for (const server of items) console.log(row([server.id, server.name, server.status, `${server.usage.cpuAbsolute.toFixed(1)}%`, bytes(server.usage.memoryBytes), server.node], widths));
      return;
    }
    case 'status': {
      if (!parameters[0]) throw new Error('status requires a server identifier.');
      const server = await findServer(parameters[0]);
      if (jsonOutput) return output(server);
      console.log(`${teal(server.name)} ${dim(`(${server.id})`)}\nState       ${server.status}\nAddress     ${server.address}\nNode        ${server.node}\nCPU         ${server.usage.cpuAbsolute.toFixed(1)}% / ${server.usage.cpuLimit || 'unlimited'}%\nMemory      ${bytes(server.usage.memoryBytes)} / ${bytes(server.usage.memoryLimitBytes)}\nDisk        ${bytes(server.usage.diskBytes)} / ${bytes(server.usage.diskLimitBytes)}\nUptime      ${Math.floor(server.usage.uptime / 1000)}s`);
      return;
    }
    case 'start': case 'stop': case 'restart': case 'kill': return power(command as PowerSignal, parameters[0]);
    case 'command': {
      const [id, ...parts] = parameters;
      if (!id || !parts.length) throw new Error('command requires a server identifier and command text.');
      const server = await findServer(id);
      const text = parts.join(' ');
      await client.client(`/servers/${server.id}/command`, { method: 'POST', body: { command: text } });
      if (jsonOutput) output({ ok: true, server: server.id, command: text });
      else console.log(`${teal('✓')} Command sent to ${server.name}`);
      return;
    }
    case 'users': {
      if (config.demoMode) throw new Error('Application API credentials are not configured.');
      const payload = await client.application<any>('/users', { query: { per_page: 100 } });
      const users = collectionAttributes<any>(payload);
      if (jsonOutput) return output(users);
      const widths = [7, 24, 34, 10]; console.log(row(['ID', 'USERNAME', 'EMAIL', 'ADMIN'], widths)); console.log(dim('─'.repeat(81)));
      for (const user of users) console.log(row([String(user.id), user.username, user.email, user.root_admin ? 'yes' : 'no'], widths));
      return;
    }
    case 'create': {
      const fileIndex = parameters.indexOf('--file');
      const file = fileIndex >= 0 ? parameters[fileIndex + 1] : undefined;
      if (!file) throw new Error('create requires --file <config.json>.');
      const body = JSON.parse(await fs.readFile(file, 'utf8'));
      const created: any = await client.application('/servers', { method: 'POST', body });
      const server = created?.attributes ?? created;
      if (jsonOutput) return output(server);
      console.log(`${teal('✓ Server created')} ${server.name ?? ''} ${dim(server.uuid ?? '')}`);
      return;
    }
    default: throw new Error(`Unknown command "${command}". Run pteroctl help for usage.`);
  }
}

main().catch((error) => {
  const message = error instanceof PterodactylApiError ? `Pterodactyl API (${error.status}): ${error.message}` : error instanceof Error ? error.message : String(error);
  if (jsonOutput) console.error(JSON.stringify({ ok: false, error: message }));
  else console.error(`${red('Error:')} ${message}`);
  process.exitCode = 1;
});
