#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { io } = require('socket.io-client');

const COMPOSE_FILES = ['-f', 'docker-compose.yml', '-f', 'infra/docker-compose.yml'];
const PROFILE_ARGS = ['--profile', 'phase2-scale'];
const NODE_PORTS = [11461, 11462, 11463];
const BASE_URLS = NODE_PORTS.map((port) => `http://127.0.0.1:${port}`);
const TENANT_ID = (process.env.SMOKE_TENANT_ID || 'default').trim();
const ROLES = ['tenant:admin', 'im:operator'];
const WAIT_TIMEOUT_MS = Number(process.env.MULTINODE_WAIT_TIMEOUT_MS || 20000);

async function run() {
  ensureScaleStack();
  await Promise.all(BASE_URLS.map((baseUrl) => waitForHealth(baseUrl)));

  const accessTokens = await Promise.all(
    BASE_URLS.map((baseUrl, index) => issueAccessToken(baseUrl, `multinode-user-${index + 1}`))
  );

  const sockets = await Promise.all(
    BASE_URLS.map((baseUrl, index) => connectSocket(baseUrl, accessTokens[index]))
  );

  const conversationId = `multinode-${randomUUID()}`;
  const messageId = `message-${randomUUID()}`;
  const traceId = `trace-${randomUUID()}`;

  try {
    await Promise.all(
      sockets.map((socket) => emitWithAck(socket, 'joinConversation', { conversationId }, 'joinConversation'))
    );

    const receiverNode2 = waitForEvent(
      sockets[1],
      'messageReceived',
      (payload) => payload && payload.messageId === messageId
    );
    const receiverNode3 = waitForEvent(
      sockets[2],
      'messageReceived',
      (payload) => payload && payload.messageId === messageId
    );

    const sendAck = await emitWithAck(
      sockets[0],
      'sendMessage',
      {
        content: `[multinode] ${new Date().toISOString()}`,
        conversationId,
        messageId,
        traceId,
      },
      'sendMessage'
    );

    const [node2Message, node3Message] = await Promise.all([receiverNode2, receiverNode3]);

    console.log(
      JSON.stringify(
        {
          conversationId,
          deliveredTo: ['coreapi-node2', 'coreapi-node3'],
          messageId,
          result: 'ok',
          sendAck,
          sequenceIds: [node2Message.sequenceId, node3Message.sequenceId],
        },
        null,
        2
      )
    );
  } finally {
    for (const socket of sockets) {
      socket.disconnect();
    }
  }
}

function ensureScaleStack() {
  execFileSync(
    'docker',
    [
      'compose',
      ...COMPOSE_FILES,
      ...PROFILE_ARGS,
      'up',
      '-d',
      '--build',
      'postgres',
      'redis',
      'coreapi-node1',
      'coreapi-node2',
      'coreapi-node3',
    ],
    {
      stdio: 'inherit',
    }
  );
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for health: ${baseUrl}/api/v1/health`);
}

async function issueAccessToken(baseUrl, userId) {
  const response = await fetch(`${baseUrl}/api/v1/auth/dev-token`, {
    body: JSON.stringify({
      roles: ROLES,
      tenantId: TENANT_ID,
      userId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Token issue failed for ${baseUrl} with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
    throw new Error(`Token issue response missing accessToken for ${baseUrl}`);
  }

  return payload.accessToken;
}

async function connectSocket(baseUrl, token) {
  const socket = io(baseUrl, {
    auth: {
      token,
    },
    reconnection: false,
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`Socket connect timed out for ${baseUrl}`));
    }, 5000);

    socket.once('connect', () => {
      clearTimeout(timeoutHandle);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });
  });

  return socket;
}

async function emitWithAck(socket, eventName, payload, label) {
  return await new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} ack timed out.`));
    }, 5000);

    socket.emit(eventName, payload, (ack) => {
      clearTimeout(timeoutHandle);
      if (!ack || (ack.ok !== true && ack.accepted !== true)) {
        reject(new Error(`${label} rejected: ${JSON.stringify(ack)}`));
        return;
      }
      resolve(ack);
    });
  });
}

async function waitForEvent(socket, eventName, predicate) {
  return await new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, 5000);

    const listener = (payload) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeoutHandle);
      socket.off(eventName, listener);
      resolve(payload);
    };

    socket.on(eventName, listener);
  });
}

async function delay(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

run().catch((error) => {
  console.error('[validateSocketIoMultiNode] failed:', error);
  process.exit(1);
});
