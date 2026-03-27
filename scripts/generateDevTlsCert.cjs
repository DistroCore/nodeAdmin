const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const certDir = path.resolve(__dirname, '..', 'Infra', 'Nginx', 'certs');
const certPath = path.join(certDir, 'dev-cert.pem');
const keyPath = path.join(certDir, 'dev-key.pem');

function ensureDir() {
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }
}

function run() {
  ensureDir();

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('[tls-cert] existing dev certificate found, skip generation.');
    return;
  }

  const command = [
    'openssl req -x509 -nodes -newkey rsa:2048',
    `-keyout "${keyPath}"`,
    `-out "${certPath}"`,
    '-days 365',
    '-subj "/CN=localhost"',
    '-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"',
  ].join(' ');

  cp.execSync(command, {
    stdio: 'inherit',
  });

  console.log('[tls-cert] generated dev certificate and key under infra/nginx/certs.');
}

try {
  run();
} catch (error) {
  console.error('[tls-cert] generation failed:', error);
  process.exit(1);
}
