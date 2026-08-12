import { AlertTriangle, Check, Info, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ServerState, ToastData } from '../types';
import { stateLabel } from '../lib';

export function StatusBadge({ state, compact = false }: { state: ServerState; compact?: boolean }) {
  return <span className={`status status--${state}`}><i />{compact ? null : stateLabel(state)}</span>;
}

export function Meter({ value, max, tone = 'teal' }: { value: number; max: number; tone?: 'teal' | 'violet' | 'amber' }) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0;
  return <div className="meter" aria-label={`${percentage.toFixed(0)} percent`}><span className={`meter__fill meter__fill--${tone}`} style={{ width: `${percentage}%` }} /></div>;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="loading"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty__icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Modal({ title, description, children, onClose, footer, width = '560px' }: { title: string; description?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
      <div className="modal__head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="modal__body">{children}</div>
      {footer && <div className="modal__footer">{footer}</div>}
    </section>
  </div>;
}

export function ToastViewport({ toasts, dismiss }: { toasts: ToastData[]; dismiss: (id: number) => void }) {
  return <div className="toasts" aria-live="polite">{toasts.map((toast) => {
    const Icon = toast.tone === 'success' ? Check : toast.tone === 'error' ? AlertTriangle : Info;
    return <div className={`toast toast--${toast.tone}`} key={toast.id}>
      <span className="toast__icon"><Icon size={16} /></span><div><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div>
      <button onClick={() => dismiss(toast.id)} aria-label="Dismiss"><X size={15} /></button>
    </div>;
  })}</div>;
}

export function SkeletonCards() {
  return <div className="stat-grid">{[1, 2, 3, 4].map((item) => <div className="stat-card skeleton-card" key={item}><span /><span /><span /></div>)}</div>;
}
