import { Command, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export function Login({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await onLogin(password); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); } finally { setBusy(false); }
  }

  return <div className="login-page">
    <div className="login-glow login-glow--one" /><div className="login-glow login-glow--two" />
    <form className="login-card" onSubmit={submit}>
      <div className="brand brand--login"><span className="brand__mark"><Command size={20} /></span><span>Ptero<span>Control</span></span></div>
      <div className="login-card__intro"><div className="login-lock"><LockKeyhole size={22} /></div><h1>Welcome back</h1><p>Sign in to manage your Pterodactyl infrastructure.</p></div>
      <label className="field"><span>Control panel password</span><div className="password-input"><input autoFocus type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
      {error && <p className="form-error">{error}</p>}
      <button className="button button--primary button--full" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="login-card__foot">Your API credentials stay on this device.</p>
    </form>
  </div>;
}
