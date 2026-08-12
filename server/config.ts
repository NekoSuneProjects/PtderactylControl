import 'dotenv/config';

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export type AppConfig = {
  port: number;
  panelUrl: string;
  clientKey: string;
  applicationKey: string;
  password: string;
  sessionSecret: string;
  demoMode: boolean;
  production: boolean;
};

export function getConfig(): AppConfig {
  const panelUrl = stripTrailingSlash(process.env.PTERODACTYL_URL?.trim() ?? '');
  const clientKey = process.env.PTERODACTYL_CLIENT_API_KEY?.trim() ?? '';
  const configuredDemo = process.env.DEMO_MODE;
  const demoMode = configuredDemo === 'true' || (configuredDemo !== 'false' && (!panelUrl || !clientKey));

  const config: AppConfig = {
    port: Number(process.env.PORT || 8787),
    panelUrl,
    clientKey,
    applicationKey: process.env.PTERODACTYL_APPLICATION_API_KEY?.trim() || clientKey,
    password: process.env.CONTROL_PANEL_PASSWORD ?? '',
    sessionSecret: process.env.SESSION_SECRET || 'development-only-session-secret-change-me',
    demoMode,
    production: process.env.NODE_ENV === 'production',
  };

  if (config.production && !config.demoMode) {
    if (!config.password) throw new Error('CONTROL_PANEL_PASSWORD is required in production live mode.');
    if (config.sessionSecret === 'development-only-session-secret-change-me' || config.sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must contain at least 32 characters in production live mode.');
    }
  }

  return config;
}
