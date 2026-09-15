const { randomUUID } = require('node:crypto');
const { io } = require('socket.io-client');

const defaultBaseUrl = 'http://127.0.0.1:11451';

const baseUrl = (process.env.CORE_API_BASE_URL || defaultBaseUrl).trim();
const socketUrl = (process.env.CORE_API_SOCKET_URL || baseUrl).trim();
const tenantId = (process.env.SMOKE_TENANT_ID || 'tenant-demo').trim();
const userId = (process.env.SMOKE_USER_ID || 'smoke-user').trim();
// Empty means "create a fresh conversation for this run". The previous hard-coded
// 'conversation-smoke' default was never created by any seed, migration or fixture in this repo,
// so joinConversation never received an ack and the smoke test hung until the CI step timed out.
const conversationId = (process.env.SMOKE_CONVERSATION_ID || '').trim();

async function issueAccessToken() {
  const response = await fetch(`${baseUrl}/api/v1/auth/dev-token`, {
    body: JSON.stringify({
      roles: ['tenant:admin'],
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

function waitForEvent(socket, eventName, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timeout waiting for event "${eventName}"`));
    }, timeoutMs);

    const listener = (payload) => {
      if (predicate(payload)) {
        clearTimeout(timeoutHandle);
        socket.off(eventName, listener);
        resolve(payload);
      }
    };

    socket.on(eventName, listener);
  });
}

function withTimeout(promise, label, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${label} (${timeoutMs}ms)`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      },
    );
  });
}

async function createConversation(accessToken) {
  const response = await fetch(`${baseUrl}/api/v1/im/conversations`, {
    body: JSON.stringify({
      // A group conversation must include at least one member other than the creator;
      // the creator is added automatically as admin.
      memberUserIds: [`${userId}-peer`],
      title: 'smoke-conversation',
      type: 'group',
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Create conversation failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload.id !== 'string' || payload.id.length === 0) {
    throw new Error('Create conversation response missing id.');
  }

  return payload.id;
}

async function run() {
  const accessToken = await issueAccessToken();
  const activeConversationId = conversationId || (await createConversation(accessToken));

  const socket = io(socketUrl, {
    auth: {
      token: accessToken,
    },
    reconnection: false,
    transports: ['websocket'],
  });

  await withTimeout(
    new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', (error) => reject(error));
    }),
    'socket connect',
  );

  await withTimeout(
    new Promise((resolve, reject) => {
      socket.emit('joinConversation', { conversationId: activeConversationId }, (ack) => {
        if (!ack || ack.ok !== true) {
          reject(new Error(`joinConversation ack failed: ${JSON.stringify(ack)}`));
          return;
        }

        resolve();
      });
    }),
    'joinConversation ack',
  );

  const messageId = `smoke-${randomUUID()}`;
  const traceId = `trace-${randomUUID()}`;

  const receivedMessagePromise = waitForEvent(
    socket,
    'messageReceived',
    (message) => Boolean(message && message.messageId === messageId),
    5000,
  );

  const sendAck = await withTimeout(
    new Promise((resolve, reject) => {
      socket.emit(
        'sendMessage',
        {
          content: `[smoke] ${new Date().toISOString()}`,
          conversationId: activeConversationId,
          messageId,
          traceId,
        },
        (ack) => {
          if (!ack || ack.accepted !== true) {
            reject(new Error(`sendMessage ack failed: ${JSON.stringify(ack)}`));
            return;
          }

          resolve(ack);
        },
      );
    }),
    'sendMessage ack',
  );

  const receivedMessage = await receivedMessagePromise;

  socket.disconnect();

  console.log(
    JSON.stringify(
      {
        receivedMessageId: receivedMessage.messageId,
        result: 'ok',
        sendAck,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error('[smokeImFlow] failed:', error);
  process.exit(1);
});
