import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Deploy } from './components/Deploy';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Overview } from './components/Overview';
import { ServerDetail } from './components/ServerDetail';
import { Servers } from './components/Servers';
import { SettingsPage } from './components/SettingsPage';
import { ToastViewport } from './components/Common';
import { UsersPage } from './components/UsersPage';
import type { DashboardData, Page, Server, ToastData } from './types';

export default function App() {
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading');
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [page, setPage] = useState<Page>('overview');
  const [selected, setSelected] = useState<Server | null>(null);
  const [data, setData] = useState<DashboardData>();
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((tone: ToastData['tone'], title: string, message?: string) => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, tone, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { setData(await api.dashboard()); }
    catch (error) {
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 401) setAuth('out');
      else notify('error', 'Could not refresh the dashboard', error instanceof Error ? error.message : undefined);
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => {
    Promise.all([api.session(), api.health()]).then(([session, health]) => {
      setMode(health.mode); setAuth(session.authenticated ? 'in' : 'out');
    }).catch(() => setAuth('out'));
  }, []);

  useEffect(() => { if (auth === 'in') refresh(); }, [auth, refresh]);
  useEffect(() => {
    const navigate = () => { setSelected(null); setPage('servers'); };
    document.addEventListener('navigate-servers', navigate);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); (document.querySelector('.global-search input') as HTMLInputElement)?.focus(); }
      if (event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) { setSelected(null); setPage('deploy'); }
    };
    window.addEventListener('keydown', shortcut);
    return () => { document.removeEventListener('navigate-servers', navigate); window.removeEventListener('keydown', shortcut); };
  }, []);

  async function login(password: string) { await api.login(password); setAuth('in'); }
  async function logout() { await api.logout(); setAuth('out'); setSelected(null); }
  function navigate(next: Page) { setSelected(null); setPage(next); }
  async function power(server: Server, signal: 'start' | 'stop' | 'restart') {
    try { await api.power(server.id, signal); notify('success', `${signal.charAt(0).toUpperCase() + signal.slice(1)} signal sent`, server.name); setTimeout(() => refresh(true), 700); }
    catch (error) { notify('error', 'Power action failed', error instanceof Error ? error.message : undefined); }
  }

  if (auth === 'loading') return <div className="splash"><div className="splash__mark">PC</div><span>Starting control centre…</span></div>;
  if (auth === 'out') return <Login onLogin={login} />;

  return <>
    <Layout page={page} setPage={navigate} mode={mode} onLogout={logout} onSearch={setQuery}>
      {selected ? <ServerDetail initial={selected} onBack={() => setSelected(null)} notify={notify} onChanged={() => refresh(true)} /> : <>
        {page === 'overview' && <Overview data={data} loading={loading} refresh={() => refresh()} onOpen={setSelected} onDeploy={() => navigate('deploy')} />}
        {page === 'servers' && <Servers servers={data?.servers ?? []} query={query} onOpen={setSelected} onPower={power} onDeploy={() => navigate('deploy')} />}
        {page === 'deploy' && <Deploy notify={notify} onCreated={(server) => { refresh(true); if (server?.id) setSelected(server); else navigate('servers'); }} />}
        {page === 'users' && <UsersPage notify={notify} />}
        {page === 'settings' && <SettingsPage notify={notify} />}
      </>}
    </Layout>
    <ToastViewport toasts={toasts} dismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
  </>;
}
