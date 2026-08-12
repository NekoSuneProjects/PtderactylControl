import { Activity, ArrowUpRight, Cpu, HardDrive, MemoryStick, MoreHorizontal, Plus, Server as ServerIcon, Users, Wifi } from 'lucide-react';
import type { DashboardData, Server } from '../types';
import { formatBytes, formatUptime } from '../lib';
import { Meter, SkeletonCards, StatusBadge } from './Common';

function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const points = values.map((value, index) => `${index / (values.length - 1) * 100},${30 - value * .25}`).join(' ');
  return <svg className={`sparkline sparkline--${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>;
}

function MiniServer({ server, onOpen }: { server: Server; onOpen: (server: Server) => void }) {
  return <button className="mini-server" onClick={() => onOpen(server)}>
    <span className="server-icon"><ServerIcon size={19} /></span>
    <span className="mini-server__main"><strong>{server.name}</strong><small>{server.node} · {server.address}</small></span>
    <StatusBadge state={server.status} />
    <span className="mini-server__usage"><small>CPU</small><strong>{server.usage.cpuAbsolute.toFixed(1)}%</strong></span>
    <span className="mini-server__usage"><small>Memory</small><strong>{formatBytes(server.usage.memoryBytes)}</strong></span>
    <ArrowUpRight className="mini-server__arrow" size={18} />
  </button>;
}

export function Overview({ data, loading, refresh, onOpen, onDeploy }: { data?: DashboardData; loading: boolean; refresh: () => void; onOpen: (server: Server) => void; onDeploy: () => void }) {
  const servers = data?.servers ?? [];
  const running = servers.filter((server) => server.status === 'running').length;
  const totalMemory = servers.reduce((sum, server) => sum + server.usage.memoryBytes, 0);
  const averageCpu = running ? servers.reduce((sum, server) => sum + server.usage.cpuAbsolute, 0) / running : 0;

  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Wednesday, 12 August</p><h1>Good afternoon, Neko.</h1><p>Here’s what’s happening across your infrastructure.</p></div><div className="heading-actions"><button className="button button--secondary" onClick={refresh}><Activity size={16} /> Refresh</button><button className="button button--primary" onClick={onDeploy}><Plus size={17} /> Deploy server</button></div></div>
    {loading && !data ? <SkeletonCards /> : <>
      <section className="stat-grid">
        <article className="stat-card"><div className="stat-card__top"><span className="stat-icon stat-icon--teal"><ServerIcon size={18} /></span><small className="trend trend--up">+2 this month</small></div><div><strong>{servers.length}</strong><span>Total servers</span></div><Sparkline tone="teal" values={[34, 45, 39, 51, 49, 62, 68, 66, 78, 80]} /></article>
        <article className="stat-card"><div className="stat-card__top"><span className="stat-icon stat-icon--green"><Wifi size={18} /></span><small>{servers.length ? Math.round(running / servers.length * 100) : 0}% healthy</small></div><div><strong>{running}</strong><span>Servers online</span></div><Sparkline tone="green" values={[58, 63, 60, 64, 62, 65, 63, 68, 67, 70]} /></article>
        <article className="stat-card"><div className="stat-card__top"><span className="stat-icon stat-icon--violet"><Cpu size={18} /></span><small>Live average</small></div><div><strong>{averageCpu.toFixed(1)}%</strong><span>CPU load</span></div><Sparkline tone="violet" values={[34, 42, 28, 50, 62, 46, 40, 58, 44, 53]} /></article>
        <article className="stat-card"><div className="stat-card__top"><span className="stat-icon stat-icon--amber"><MemoryStick size={18} /></span><small>Allocated usage</small></div><div><strong>{formatBytes(totalMemory)}</strong><span>Memory in use</span></div><Sparkline tone="amber" values={[32, 36, 39, 42, 41, 48, 50, 57, 55, 61]} /></article>
      </section>
      <section className="overview-grid">
        <div className="panel panel--servers"><div className="panel__head"><div><h2>Server health</h2><p>Live performance and status</p></div><button className="text-button" onClick={() => document.dispatchEvent(new CustomEvent('navigate-servers'))}>View all <ArrowUpRight size={15} /></button></div><div className="mini-server-list">{servers.slice(0, 4).map((server) => <MiniServer key={server.id} server={server} onOpen={onOpen} />)}</div></div>
        <div className="panel resource-panel"><div className="panel__head"><div><h2>Infrastructure</h2><p>Current capacity</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div>
          <div className="capacity-ring"><div><strong>{running}</strong><span>of {servers.length}</span></div></div>
          <div className="capacity-legend"><div><span><i className="legend-dot legend-dot--teal" />Online</span><strong>{running}</strong></div><div><span><i className="legend-dot legend-dot--gray" />Offline</span><strong>{servers.filter((server) => server.status === 'offline').length}</strong></div><div><span><i className="legend-dot legend-dot--red" />Needs attention</span><strong>{servers.filter((server) => server.status === 'error').length}</strong></div></div>
          <div className="infra-meta"><div><Users size={16} /><span><strong>{data?.users ?? 0}</strong> users</span></div><div><HardDrive size={16} /><span><strong>{data?.nodes ?? 0}</strong> nodes</span></div></div>
        </div>
      </section>
      <section className="panel recent-panel"><div className="panel__head"><div><h2>At a glance</h2><p>Resource allocation across the fleet</p></div><span className="updated">Updated just now</span></div>
        <div className="resource-table"><div className="resource-table__head"><span>Server</span><span>Memory</span><span>Storage</span><span>Uptime</span><span>Status</span></div>{servers.map((server) => <button key={server.id} onClick={() => onOpen(server)}><span><strong>{server.name}</strong><small>{server.id}</small></span><span><div className="resource-value"><small>{formatBytes(server.usage.memoryBytes)}</small><small>{server.limits.memory / 1024} GB</small></div><Meter value={server.usage.memoryBytes} max={server.usage.memoryLimitBytes} /></span><span><div className="resource-value"><small>{formatBytes(server.usage.diskBytes)}</small><small>{server.limits.disk / 1024} GB</small></div><Meter value={server.usage.diskBytes} max={server.usage.diskLimitBytes} tone="violet" /></span><span>{formatUptime(server.usage.uptime)}</span><span><StatusBadge state={server.status} /></span></button>)}</div>
      </section>
    </>}
  </div>;
}
