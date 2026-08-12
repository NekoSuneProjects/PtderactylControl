import { Activity as ActivityIcon, AlertTriangle, ArrowLeft, ChevronRight, CircleStop, Clock3, Copy, DatabaseBackup, File, FileCode2, Folder, FolderOpen, Gauge, HardDrive, MemoryStick, Network, Play, Plus, Power, RefreshCw, Save, Send, Server as ServerIcon, Settings2, ShieldCheck, SquareTerminal, Trash2, Wifi } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatBytes, formatUptime, joinPath, relativeTime } from '../lib';
import type { Activity, Allocation, Backup, FileItem, ResourceStats, Server } from '../types';
import { EmptyState, Loading, Meter, Modal, StatusBadge } from './Common';

type Tab = 'console' | 'files' | 'backups' | 'network' | 'activity';
const stripAnsi = (value: string) => value.replace(/[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '');

function ConsolePanel({ server, notify, onStats }: { server: Server; notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void; onStats: (stats: ResourceStats) => void }) {
  const [lines, setLines] = useState<string[]>([
    '[PteroControl] Connecting to server console…',
  ]);
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);
  const [follow, setFollow] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);

  const pushLine = useCallback((line: string) => setLines((current) => [...current.slice(-999), stripAnsi(line)]), []);

  useEffect(() => {
    let disposed = false;
    api.websocket(server.id).then((credentials) => {
      if (disposed) return;
      if (credentials.demo) {
        setConnected(true);
        setLines([
          '[15:42:08 INFO]: Starting minecraft server version 1.21.8',
          '[15:42:09 INFO]: Loading properties',
          '[15:42:11 INFO]: Preparing level "world"',
          '[15:42:14 INFO]: Preparing spawn area: 100%',
          '[15:42:15 INFO]: Done (6.824s)! For help, type "help"',
          '[15:44:02 INFO]: NekoAdmin joined the game',
          '[15:44:02 INFO]: NekoAdmin[/10.0.0.4:51728] logged in with entity id 183',
        ]);
        return;
      }
      if (!credentials.socket || !credentials.token) throw new Error('Panel did not return console credentials.');
      const socket = new WebSocket(credentials.socket);
      socketRef.current = socket;
      socket.onopen = () => socket.send(JSON.stringify({ event: 'auth', args: [credentials.token] }));
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(String(message.data));
          if (payload.event === 'auth success') setConnected(true);
          if (payload.event === 'console output') pushLine(String(payload.args?.[0] ?? ''));
          if (payload.event === 'status') setConnected(true);
          if (payload.event === 'stats') {
            const raw = JSON.parse(payload.args?.[0] ?? '{}');
            onStats({ state: raw.state ?? server.status, memoryBytes: raw.memory_bytes ?? 0, memoryLimitBytes: server.usage.memoryLimitBytes, cpuAbsolute: raw.cpu_absolute ?? 0, cpuLimit: server.usage.cpuLimit, diskBytes: raw.disk_bytes ?? 0, diskLimitBytes: server.usage.diskLimitBytes, networkRxBytes: raw.network?.rx_bytes ?? 0, networkTxBytes: raw.network?.tx_bytes ?? 0, uptime: raw.uptime ?? 0 });
          }
        } catch { pushLine(String(message.data)); }
      };
      socket.onclose = () => { if (!disposed) setConnected(false); };
      socket.onerror = () => { if (!disposed) pushLine('[PteroControl] Console connection failed.'); };
    }).catch((error) => pushLine(`[PteroControl] ${error.message}`));
    return () => { disposed = true; socketRef.current?.close(); };
  }, [server.id]);

  useEffect(() => { if (follow && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; }, [lines, follow]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    setCommand(''); history.current.unshift(value); historyIndex.current = -1; pushLine(`> ${value}`);
    try {
      await api.command(server.id, value);
      if (!socketRef.current) setTimeout(() => pushLine(`[15:45:${String(Math.floor(Math.random() * 60)).padStart(2, '0')} INFO]: Command executed successfully`), 350);
    } catch (error) { notify('error', 'Command failed', error instanceof Error ? error.message : undefined); }
  }

  return <div className="console-wrap">
    <div className="console-toolbar"><span><i className={connected ? 'console-online' : ''} />{connected ? 'Live console' : 'Connecting…'}</span><label><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} /> Follow output</label><button onClick={() => setLines([])}>Clear</button></div>
    <div className="terminal" ref={viewport}>{lines.length ? lines.map((line, index) => <div key={index}><span className="line-number">{String(index + 1).padStart(2, '0')}</span><code>{line}</code></div>) : <div className="terminal-empty">Console output will appear here.</div>}</div>
    <form className="command-bar" onSubmit={send}><span>›</span><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => {
      if (event.key === 'ArrowUp' && history.current.length) { event.preventDefault(); historyIndex.current = Math.min(history.current.length - 1, historyIndex.current + 1); setCommand(history.current[historyIndex.current]); }
      if (event.key === 'ArrowDown') { event.preventDefault(); historyIndex.current = Math.max(-1, historyIndex.current - 1); setCommand(historyIndex.current < 0 ? '' : history.current[historyIndex.current]); }
    }} placeholder="Type a command and press Enter…" disabled={server.status !== 'running'} /><button disabled={!command.trim() || server.status !== 'running'}><Send size={16} /> Send</button></form>
  </div>;
}

function FilesPanel({ server, notify }: { server: Server; notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void }) {
  const [directory, setDirectory] = useState('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { setLoading(true); api.files(server.id, directory).then(setFiles).catch((error) => notify('error', 'Could not load files', error.message)).finally(() => setLoading(false)); }, [server.id, directory]);
  useEffect(() => { void load(); }, [load]);

  async function open(item: FileItem) {
    const filePath = joinPath(directory, item.name);
    if (!item.is_file) return setDirectory(filePath || '/');
    if (item.size > 2_000_000) return notify('info', 'File is too large to edit', 'Use SFTP for files larger than 2 MB.');
    try { setEditing({ path: filePath, content: await api.file(server.id, filePath) }); } catch (error) { notify('error', 'Could not open file', error instanceof Error ? error.message : undefined); }
  }

  async function save() {
    if (!editing) return; setSaving(true);
    try { await api.writeFile(server.id, editing.path, editing.content); notify('success', 'File saved', editing.path); setEditing(null); }
    catch (error) { notify('error', 'Save failed', error instanceof Error ? error.message : undefined); }
    finally { setSaving(false); }
  }

  const parts = directory.split('/').filter(Boolean);
  return <div className="files-panel"><div className="file-toolbar"><div className="breadcrumbs"><button onClick={() => setDirectory('/')}><HardDrive size={15} /> root</button>{parts.map((part, index) => <span key={`${part}-${index}`}><ChevronRight size={14} /><button onClick={() => setDirectory(`/${parts.slice(0, index + 1).join('/')}`)}>{part}</button></span>)}</div><div><button className="button button--ghost button--small" onClick={load}><RefreshCw size={15} /> Refresh</button><button className="button button--secondary button--small"><Plus size={15} /> New</button></div></div>{loading ? <Loading label="Reading directory…" /> : <div className="file-list"><div className="file-list__head"><span>Name</span><span>Size</span><span>Modified</span><span>Permissions</span></div>{directory !== '/' && <button className="file-row" onClick={() => setDirectory(`/${parts.slice(0, -1).join('/')}` || '/')}><span><FolderOpen size={18} />..</span><span>—</span><span>—</span><span>—</span></button>}{files.map((item) => <button className="file-row" key={item.name} onClick={() => open(item)}><span>{item.is_file ? <File size={18} /> : <Folder size={18} />}<strong>{item.name}</strong></span><span>{item.is_file ? formatBytes(item.size) : '—'}</span><span>{relativeTime(item.modified_at)}</span><span><code>{item.mode_bits}</code></span></button>)}</div>}
    {editing && <Modal title={editing.path.split('/').pop() || editing.path} description={editing.path} onClose={() => setEditing(null)} width="820px" footer={<><button className="button button--ghost" onClick={() => setEditing(null)}>Cancel</button><button className="button button--primary" onClick={save} disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save changes'}</button></>}><textarea className="code-editor" spellCheck={false} value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} /></Modal>}
  </div>;
}

function BackupsPanel({ server, notify }: { server: Server; notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void }) {
  const [backups, setBackups] = useState<Backup[]>([]); const [loading, setLoading] = useState(true); const [creating, setCreating] = useState(false); const [name, setName] = useState('');
  const load = useCallback(() => api.backups(server.id).then(setBackups).catch((error) => notify('error', 'Could not load backups', error.message)).finally(() => setLoading(false)), [server.id]);
  useEffect(() => { void load(); }, [load]);
  async function create() { setCreating(true); try { await api.createBackup(server.id, name); setName(''); await load(); notify('success', 'Backup started', 'You can leave this page while it runs.'); } catch (error) { notify('error', 'Backup failed', error instanceof Error ? error.message : undefined); } finally { setCreating(false); } }
  async function remove(uuid: string) { try { await api.deleteBackup(server.id, uuid); setBackups((current) => current.filter((item) => item.uuid !== uuid)); notify('success', 'Backup deleted'); } catch (error) { notify('error', 'Could not delete backup', error instanceof Error ? error.message : undefined); } }
  return <div className="subpage"> <div className="subpage-head"><div><h3>Backups</h3><p>Create restore points before major changes.</p></div><div className="backup-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional backup name" /><button className="button button--primary button--small" onClick={create} disabled={creating}><Plus size={15} />{creating ? 'Starting…' : 'Create backup'}</button></div></div>{loading ? <Loading /> : backups.length ? <div className="backup-list">{backups.map((backup) => <article key={backup.uuid}><span className="backup-icon"><DatabaseBackup size={19} /></span><div><strong>{backup.name}</strong><small>{backup.completed_at ? `Completed ${relativeTime(backup.completed_at)}` : 'Backup in progress…'}</small></div><span>{formatBytes(backup.bytes)}</span><span className={backup.is_successful ? 'success-text' : 'warning-text'}>{backup.completed_at ? backup.is_successful ? 'Complete' : 'Failed' : 'Running'}</span><button className="icon-button danger" disabled={backup.is_locked} onClick={() => remove(backup.uuid)} title={backup.is_locked ? 'Unlock this backup in Pterodactyl before deleting it.' : 'Delete backup'}><Trash2 size={16} /></button></article>)}</div> : <EmptyState icon={<DatabaseBackup />} title="No backups yet" description="Create a restore point for this server." />}</div>;
}

function NetworkPanel({ server, notify }: { server: Server; notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void }) {
  const [allocations, setAllocations] = useState<Allocation[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.network(server.id).then(setAllocations).catch((error) => notify('error', 'Could not load allocations', error.message)).finally(() => setLoading(false)); }, [server.id]);
  function copy(value: string) { navigator.clipboard.writeText(value); notify('success', 'Address copied', value); }
  return <div className="subpage"><div className="subpage-head"><div><h3>Network allocations</h3><p>Addresses and ports assigned to this server.</p></div></div>{loading ? <Loading /> : <div className="allocation-list">{allocations.map((allocation) => <article key={allocation.id}><span className="allocation-icon"><Network size={18} /></span><div><strong>{allocation.alias || allocation.ip}:{allocation.port}</strong><small>{allocation.alias ? `${allocation.ip}:${allocation.port}` : allocation.notes || 'Direct allocation'}</small></div>{allocation.is_default && <span className="soft-badge">Primary</span>}<button className="icon-button" onClick={() => copy(`${allocation.alias || allocation.ip}:${allocation.port}`)}><Copy size={16} /></button></article>)}</div>}</div>;
}

function ActivityPanel({ server, notify }: { server: Server; notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void }) {
  const [items, setItems] = useState<Activity[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.activity(server.id).then(setItems).catch((error) => notify('error', 'Could not load activity', error.message)).finally(() => setLoading(false)); }, [server.id]);
  return <div className="subpage"><div className="subpage-head"><div><h3>Activity</h3><p>Recent actions and security events for this server.</p></div></div>{loading ? <Loading /> : <div className="activity-list">{items.map((item) => <article key={item.id}><span><ActivityIcon size={16} /></span><div><strong>{item.event.split(':').join(' · ')}</strong><small>{item.is_api ? 'Performed through API' : 'Performed in panel'}{item.ip ? ` from ${item.ip}` : ''}</small></div><time>{relativeTime(item.timestamp)}</time></article>)}</div>}</div>;
}

export function ServerDetail({ initial, onBack, notify, onChanged }: { initial: Server; onBack: () => void; notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void; onChanged: () => void }) {
  const [server, setServer] = useState(initial); const [tab, setTab] = useState<Tab>('console'); const [powerOpen, setPowerOpen] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => api.resources(server.id).then((usage) => setServer((current) => ({ ...current, status: usage.state, usage }))).catch(() => undefined), 5000); return () => clearInterval(timer); }, [server.id]);
  async function power(signal: 'start' | 'stop' | 'restart' | 'kill') { setBusy(true); setPowerOpen(false); try { await api.power(server.id, signal); setServer((current) => ({ ...current, status: signal === 'start' || signal === 'restart' ? 'starting' : 'stopping', usage: { ...current.usage, state: signal === 'start' || signal === 'restart' ? 'starting' : 'stopping' } })); notify('success', `${signal.charAt(0).toUpperCase() + signal.slice(1)} signal sent`, server.name); onChanged(); } catch (error) { notify('error', 'Power action failed', error instanceof Error ? error.message : undefined); } finally { setBusy(false); } }
  const tabs: Array<{ id: Tab; label: string; icon: typeof SquareTerminal }> = [{ id: 'console', label: 'Console', icon: SquareTerminal }, { id: 'files', label: 'Files', icon: FileCode2 }, { id: 'backups', label: 'Backups', icon: DatabaseBackup }, { id: 'network', label: 'Network', icon: Network }, { id: 'activity', label: 'Activity', icon: ActivityIcon }];

  return <div className="page detail-page"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Back to servers</button>
    <div className="server-hero"><div className="server-hero__identity"><span className="server-icon server-icon--large"><ServerIcon size={24} /></span><div><div><h1>{server.name}</h1><StatusBadge state={server.status} /></div><p>{server.description || 'No description'} · <code>{server.id}</code></p></div></div><div className="server-hero__actions"><button className="button button--secondary" disabled={busy} onClick={() => power(server.status === 'running' ? 'restart' : 'start')}>{server.status === 'running' ? <RefreshCw size={16} /> : <Play size={16} />}{server.status === 'running' ? 'Restart' : 'Start'}</button><div className="power-menu-wrap"><button className="button button--danger-ghost" disabled={busy || server.status === 'offline'} onClick={() => setPowerOpen((value) => !value)}><Power size={16} /> Stop <ChevronRight className="rotate-90" size={15} /></button>{powerOpen && <div className="action-menu action-menu--right"><button onClick={() => power('stop')}><CircleStop size={15} /> Graceful stop</button><button className="danger" onClick={() => power('kill')}><AlertTriangle size={15} /> Kill process</button></div>}</div><button className="icon-button"><Settings2 size={18} /></button></div></div>
    <section className="metric-strip"><div><span className="metric-icon metric-icon--teal"><Gauge size={18} /></span><span><small>CPU usage</small><strong>{server.usage.cpuAbsolute.toFixed(1)}%</strong></span><Meter value={server.usage.cpuAbsolute} max={server.usage.cpuLimit || 100} /></div><div><span className="metric-icon metric-icon--violet"><MemoryStick size={18} /></span><span><small>Memory</small><strong>{formatBytes(server.usage.memoryBytes)} <em>/ {formatBytes(server.usage.memoryLimitBytes)}</em></strong></span><Meter value={server.usage.memoryBytes} max={server.usage.memoryLimitBytes} tone="violet" /></div><div><span className="metric-icon metric-icon--amber"><HardDrive size={18} /></span><span><small>Storage</small><strong>{formatBytes(server.usage.diskBytes)} <em>/ {formatBytes(server.usage.diskLimitBytes)}</em></strong></span><Meter value={server.usage.diskBytes} max={server.usage.diskLimitBytes} tone="amber" /></div><div><span className="metric-icon"><Clock3 size={18} /></span><span><small>Uptime</small><strong>{formatUptime(server.usage.uptime)}</strong></span></div><div><span className="metric-icon"><Wifi size={18} /></span><span><small>Address</small><strong className="address-value">{server.address}</strong></span></div></section>
    <div className="detail-panel panel"><div className="tabs">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}</div>{tab === 'console' && <ConsolePanel server={server} notify={notify} onStats={(usage) => setServer((current) => ({ ...current, status: usage.state, usage }))} />}{tab === 'files' && <FilesPanel server={server} notify={notify} />}{tab === 'backups' && <BackupsPanel server={server} notify={notify} />}{tab === 'network' && <NetworkPanel server={server} notify={notify} />}{tab === 'activity' && <ActivityPanel server={server} notify={notify} />}</div>
  </div>;
}
