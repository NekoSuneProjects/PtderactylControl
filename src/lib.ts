import type { ServerState } from './types';

export function formatBytes(value: number, decimals = 1) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? decimals : 0)} ${units[index]}`;
}

export function formatUptime(ms: number) {
  if (!ms) return '—';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function relativeTime(date: string) {
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return format.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}

export function stateLabel(state: ServerState) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function joinPath(directory: string, name: string) {
  return `${directory === '/' ? '' : directory}/${name}`.replace(/\/+/g, '/');
}
