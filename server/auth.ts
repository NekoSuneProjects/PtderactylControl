import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from './config.js';

const COOKIE_NAME = 'ptero_control_session';
const SESSION_AGE_SECONDS = 60 * 60 * 12;

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createSession(config: AppConfig) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS;
  const value = String(expires);
  return `${value}.${sign(value, config.sessionSecret)}`;
}

export function isSessionValid(token: string | undefined, config: AppConfig) {
  if (!config.password) return true;
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  return safeEqual(signature, sign(expires, config.sessionSecret));
}

export function passwordMatches(candidate: string, config: AppConfig) {
  return Boolean(config.password) && safeEqual(candidate, config.password);
}

export function setSessionCookie(response: Response, config: AppConfig) {
  response.cookie(COOKIE_NAME, createSession(config), {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.production,
    maxAge: SESSION_AGE_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(response: Response, config: AppConfig) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.production,
    path: '/',
  });
}

export function requireAuth(config: AppConfig) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (isSessionValid(request.cookies?.[COOKIE_NAME], config)) return next();
    response.status(401).json({ error: 'Please sign in to PteroControl.' });
  };
}

export const sessionCookieName = COOKIE_NAME;
