const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { io } = require('socket.io-client');
const { Kafka } = require('kafkajs');

const defaultBaseUrl = 'http://127.0.0.1:11451';
const baseUrl = (process.env.CORE_API_BASE_URL || defaultBaseUrl).trim();
const socketUrl = (process.env.CORE_API_SOCKET_URL || baseUrl).trim();
const databaseUrl = (process.env.DATABASE_URL || 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin').trim();
const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const outboxTopic = (process.env.OUTBOX_TOPIC || 'im.events').trim();
const dlqTopic = (process.env.OUTBOX_DLQ_TOPIC || 'im.events.dlq').trim();
const outboxPartitions = Number(process.env.OUTBOX_TOPIC_PARTITIONS || 6);
const dlqPartitions = Number(process.env.OUTBOX_DLQ_TOPIC_PARTITIONS || 6);
const tenantId = (process.env.SMOKE_TENANT_ID || 'tenant-demo').trim();
const userId = (process.env.SMOKE_USER_ID || 'smoke-outbox-user').trim();
// Empty means "create a fresh conversation for this run". As in smokeImFlow.cjs, the previous
// hard-coded default was never created anywhere, so joinConversation never acked and this smoke
// test hung until the surrounding CI step timed out.
const conversationId = (process.env.SMOKE_CONVERSATION_ID || '').trim();
const waitTimeoutMs = Number(process.env.SMOKE_OUTBOX_TIMEOUT_MS || 15000);

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

async function ensureTopics(kafka) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await ensureTopic(admin, outboxTopic, outboxPartitions);
    await ensureTopic(admin, dlqTopic, dlqPartitions);
  } finally {
    await admin.disconnect();
  }
}

async function ensureTopic(admin, topic, targetPartitions) {
  const existingTopics = await admin.listTopics();

  if (!existingTopics.includes(topic)) {
    await admin.createTopics({
      topics: [{ topic, numPartitions: targetPartitions, replicationFactor: 1 }],
      waitForLeaders: true,
    });
    return;
  }

  const metadata = await admin.fetchTopicMetadata({
    topics: [topic],
  });
  const existingTopic = metadata.topics.find((item) => item.name === topic);
  if (!existingTopic) {
    throw new Error(`Topic metadata missing after creation: ${topic}`);
  }

  if (existingTopic.partitions.length >= targetPartitions) {
    return;
  }

  await admin.createPartitions({
    topicPartitions: [{ topic, count: targetPartitions }],
    validateOnly: false,
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
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

async function ensureConversation(accessToken) {
  if (conversationId) {
    return conversationId;
  }

  const response = await fetch(`${baseUrl}/api/v1/im/conversations`, {
    body: JSON.stringify({
      // A group conversation must include at least one member other than the creator;
      // the creator is added automatically as admin.
      memberUserIds: [`${userId}-peer`],
      title: 'smoke-outbox-conversation',
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
  const activeConversationId = await ensureConversation(accessToken);
  const messageId = `outbox-smoke-${randomUUID()}`;
  const traceId = `trace-${randomUUID()}`;
  const kafka = new Kafka({
    brokers: kafkaBrokers,
    clientId: 'smoke-outbox-client',
  });

  await ensureTopics(kafka);

  const consumer = kafka.consumer({
    groupId: `smoke-outbox-${randomUUID()}`,
  });
  await consumer.connect();
  await consumer.subscribe({ topic: outboxTopic, fromBeginning: false });

  let consumedEvent = null;
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      const parsed = JSON.parse(message.value.toString('utf8'));
      if (parsed && parsed.messageId === messageId) {
        consumedEvent = parsed;
      }
    },
  });

  const socket = io(socketUrl, {
    auth: { token: accessToken },
    reconnection: false,
    transports: ['websocket'],
  });

  try {
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

    await withTimeout(
      new Promise((resolve, reject) => {
        socket.emit(
          'sendMessage',
          {
            content: `[outbox-smoke] ${new Date().toISOString()}`,
            conversationId: activeConversationId,
            messageId,
            messageType: 'system',
            traceId,
          },
          (ack) => {
            if (!ack || ack.accepted !== true) {
              reject(new Error(`sendMessage ack failed: ${JSON.stringify(ack)}`));
              return;
            }
            resolve();
          },
        );
      }),
      'sendMessage ack',
    );

    const startedAt = Date.now();
    while (Date.now() - startedAt < waitTimeoutMs) {
      if (consumedEvent) {
        break;
      }
      await wait(300);
    }

    if (!consumedEvent) {
      throw new Error(`Timeout waiting kafka message for messageId=${messageId}`);
    }

    const dbClient = new Client({
      connectionString: databaseUrl,
    });
    await dbClient.connect();
    let outboxRow;
    try {
      const queryResult = await dbClient.query(
        `
          SELECT id, published_at, retry_count, dlq_at
          FROM outbox_events
          WHERE payload::jsonb ->> 'messageId' = $1
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        [messageId],
      );
      outboxRow = queryResult.rows[0];
    } finally {
      await dbClient.end();
    }

    if (!outboxRow) {
      throw new Error(`Outbox row not found for messageId=${messageId}`);
    }
    if (!outboxRow.published_at) {
      throw new Error(`Outbox row not published for messageId=${messageId}`);
    }
    if (outboxRow.dlq_at) {
      throw new Error(`Outbox row unexpectedly moved to DLQ for messageId=${messageId}`);
    }

    console.log(
      JSON.stringify(
        {
          kafkaTopic: outboxTopic,
          messageId,
          outboxId: outboxRow.id,
          result: 'ok',
          retryCount: outboxRow.retry_count,
        },
        null,
        2,
      ),
    );
  } finally {
    socket.disconnect();
    await consumer.disconnect();
  }
}

run().catch((error) => {
  console.error('[smokeOutboxKafka] failed:', error);
  process.exit(1);
});
