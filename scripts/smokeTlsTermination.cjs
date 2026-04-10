const https = require('node:https');

const targetUrl = (process.env.TLS_SMOKE_URL || 'https://127.0.0.1:3443/api/v1/health').trim();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        rejectUnauthorized: false,
      },
      (response) => {
        const buffers = [];
        response.on('data', (chunk) => buffers.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(buffers).toString('utf8');
          if (response.statusCode !== 200) {
            reject(new Error(`Unexpected status ${response.statusCode}: ${body}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('error', reject);
  });
}

async function run() {
  const payload = await fetchJson(targetUrl);
  if (payload.status !== 'ok') {
    throw new Error(`Unexpected health payload: ${JSON.stringify(payload)}`);
  }

  console.log(
    JSON.stringify(
      {
        result: 'ok',
        targetUrl,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error('[smokeTlsTermination] failed:', error);
  process.exit(1);
});
