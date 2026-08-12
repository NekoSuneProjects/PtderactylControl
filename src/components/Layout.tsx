import { Bell, Box, ChevronDown, Command, LayoutDashboard, Menu, Plus, Search, Server as ServerIcon, Settings, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Page } from '../types';

const items: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'servers', label: 'Servers', icon: ServerIcon },
  { id: 'deploy', label: 'Deploy server', icon: Plus },
  { id: 'users', label: 'Users', icon: Users },
];

export function Layout({ page, setPage, mode, children, onLogout, onSearch }: { page: Page; setPage: (page: Page) => void; mode: 'demo' | 'live'; children: React.ReactNode; onLogout: () => void; onSearch: (value: string) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [page]);

  return <div className="shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="brand"><span className="brand__mark"><Command size={19} /></span><span>Ptero<span>Control</span></span><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button></div>
      <div className="workspace"><span className="workspace__avatar">NH</span><span><small>Workspace</small><strong>Neko Hosting</strong></span><ChevronDown size={15} /></div>
      <nav className="nav" aria-label="Primary navigation">
        <p>Control centre</p>
        {items.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={18} /><span>{label}</span>{id === 'deploy' && <kbd>N</kbd>}</button>)}
        <p>System</p>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Settings size={18} /><span>Connection</span></button>
      </nav>
      <div className="sidebar__bottom">
        <div className="connection-card"><span className="pulse-dot" /><div><strong>{mode === 'live' ? 'Panel connected' : 'Demo workspace'}</strong><small>{mode === 'live' ? 'API gateway online' : 'No keys required'}</small></div></div>
        <div className="version"><Box size={14} /> PteroControl v1.0</div>
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <div className="main-column">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <label className="global-search"><Search size={17} /><input placeholder="Search servers…" onChange={(event) => onSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
        <div className="topbar__right">
          {mode === 'demo' && <span className="demo-pill">Demo mode</span>}
          <button className="icon-button"><Bell size={18} /><span className="notification-dot" /></button>
          <div className="profile-wrap"><button className="profile" onClick={() => setProfileOpen((value) => !value)}><span>NA</span><div><strong>Neko Admin</strong><small>Administrator</small></div><ChevronDown size={15} /></button>
          {profileOpen && <div className="profile-menu"><button onClick={() => setPage('settings')}>Connection settings</button><button onClick={onLogout}>Sign out</button></div>}</div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  </div>;
}
