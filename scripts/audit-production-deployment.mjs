#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const compose = read('docker-compose.yml');
const nginx = read('nginx/templates/default.conf.template');
const viteDocker = read('frontend_web/Dockerfile');
const nextConfig = read('frontend_web/landing_next/next.config.ts');
const backendDocker = read('backend/Dockerfile');

const failures = [];
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(label);
};
const requireOrder = (source, first, second, label) => {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) failures.push(label);
};

requireText(compose, 'PLATFORM_API_URL: "http://web:8000/api/v1"', 'Next platform upstream must target /api/v1');
requireText(compose, 'HUB_API_URL: "http://web:8000/api/v1"', 'Next hub upstream must target /api/v1');
requireText(compose, 'SECURE_SSL_REDIRECT: "True"', 'production backend must force HTTPS');
requireText(compose, 'SESSION_COOKIE_SECURE: "True"', 'production session cookie must be Secure');
requireText(compose, 'CSRF_COOKIE_SECURE: "True"', 'production CSRF cookie must be Secure');
requireText(compose, 'JWT_COOKIE_SECURE: "True"', 'production JWT cookies must be Secure');
requireText(compose, 'APP_ENV: "vps"', 'production backend must run with non-development APP_ENV');
requireText(compose, 'command: ["daphne", "-b", "0.0.0.0", "-p", "8000", "core.asgi:application"]', 'production HTTP/WebSocket server must use ASGI/Daphne');
requireText(compose, 'RUN_MIGRATIONS: "1"', 'web deployment must own migration execution');
if ((compose.match(/RUN_MIGRATIONS: "0"/g) || []).length < 2) {
  failures.push('Celery processes must not run migrations');
}

requireText(viteDocker, 'ARG VITE_API_URL=/api/v1', 'Vite production build must default to /api/v1');
requireText(nextConfig, "const api=process.env.PLATFORM_API_URL||'http://127.0.0.1:8000/api/v1';", 'Next default backend root must be /api/v1');
requireText(nextConfig, "{source:'/api/v1/:path*',destination:`${api}/:path*`}", 'Next canonical same-origin API rewrite must be /api/v1');
requireText(nextConfig, "{source:'/ws/:path*'", 'Next WebSocket rewrite must remain outside API versioning');
requireText(nextConfig, "{source:'/media/:path*'", 'Next media rewrite must remain outside API versioning');

requireOrder(nginx, 'location /api/hub/', 'location /api/ {', 'Nginx hub BFF route must precede generic backend API routing');
requireOrder(nginx, 'location /api/platform/', 'location /api/ {', 'Nginx platform BFF route must precede generic backend API routing');
requireText(nginx, 'location /ws/ {', 'Nginx must expose WebSockets outside /api/v1');
requireText(nginx, 'Strict-Transport-Security', 'Nginx must emit HSTS');
requireText(nginx, 'X-Frame-Options "DENY"', 'Nginx must deny framing');
requireText(nginx, 'X-Content-Type-Options "nosniff"', 'Nginx must emit nosniff');
requireText(nginx, 'Referrer-Policy "strict-origin-when-cross-origin"', 'Nginx must emit the production referrer policy');

requireText(backendDocker, 'USER appuser', 'backend container must not run as root');
requireText(backendDocker, 'CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "core.asgi:application"]', 'backend image default must use Daphne');

const removedClientProfileRoot = ['/api', 'client-profile', ''].join('/');
for (const [name, source] of [
  ['docker-compose.yml', compose],
  ['nginx/templates/default.conf.template', nginx],
  ['frontend_web/Dockerfile', viteDocker],
  ['frontend_web/landing_next/next.config.ts', nextConfig],
]) {
  if (source.includes(removedClientProfileRoot)) {
    failures.push(`${name} still contains the removed client-profile deployment path`);
  }
}

if (failures.length) {
  console.error('F07 production deployment audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('F07 production deployment audit passed.');
