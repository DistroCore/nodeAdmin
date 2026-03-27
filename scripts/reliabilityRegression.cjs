const { randomUUID } = require('node:crypto');
const { io } = require('socket.io-client');

const defaultBaseUrl = 'http://127.0.0.1:3001';
const baseUrl = (process.env.CORE_API_BASE_URL || defaultBaseUrl).trim();
const socketUrl = (process.env.CORE_API_SOCKET_URL || baseUrl).trim();
const tenantId = (process.env.SMOKE_TENANT_ID || 'tenant-demo').trim();
const userId = (process.env.SMOKE_USER_ID || 'reliability-user').trim();
const conversationId = (process.env.SMOKE_CONVERSATION_ID || 'conversation-reliability').trim();

async function issueAccessToken() {
  const response = await fetch(`${baseUrl}/api/v1/auth/dev-token`, {
    body: JSON.stringify({
      roles: ['tenant:admin', 'im:operator'],
      tenantId,
      userId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Token issue failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
    throw new Error('Token issue response missing accessToken.');
  }

  return payload.accessToken;
}

async function run() {
  const accessToken = await issueAccessToken();
  const socket = io(socketUrl, {
    auth: {
      token: accessToken,
    },
    reconnection: false,
    transports: ['websocket'],
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });

    await new Promise((resolve, reject) => {
      socket.emit('joinConversation', { conversationId }, (ack) => {
        if (!ack || ack.ok !== true) {
          reject(new Error('joinConversation failed'));
          return;
        }
        resolve();
      });
    });

    const messageId = `reliability-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    const payload = {
      content: `Reliability check ${new Date().toISOString()}`,
      conversationId,
      messageId,
      traceId,
    };

    const firstAck = await new Promise((resolve, reject) => {
      socket.emit('sendMessage', payload, (ack) => {
        if (!ack || ack.accepted !== true) {
          reject(new Error('first sendMessage ack failed'));
          return;
        }
        resolve(ack);
      });
    });

    const duplicateAck = await new Promise((resolve, reject) => {
      socket.emit('sendMessage', payload, (ack) => {
        if (!ack || ack.accepted !== true) {
          reject(new Error('duplicate sendMessage ack failed'));
          return;
        }
        resolve(ack);
      });
    });

    if (firstAck.duplicate !== false) {
      throw new Error('first ack should not be duplicate');
    }
    if (duplicateAck.duplicate !== true) {
      throw new Error('second ack should be duplicate');
    }
    if (firstAck.sequenceId !== duplicateAck.sequenceId) {
      throw new Error('duplicate message sequenceId mismatch');
    }

    console.log(
      JSON.stringify(
        {
          duplicateSequenceId: duplicateAck.sequenceId,
          messageId,
          result: 'ok',
        },
        null,
        2
      )
    );
  } finally {
    socket.disconnect();
  }
}

run().catch((error) => {
  console.error('[reliabilityRegression] failed:', error);
  process.exit(1);
});
