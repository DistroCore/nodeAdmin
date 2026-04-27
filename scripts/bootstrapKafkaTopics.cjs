#!/usr/bin/env node

const { Kafka } = require('kafkajs');

const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const outboxTopic = (process.env.OUTBOX_TOPIC || 'im.events').trim();
const dlqTopic = (process.env.OUTBOX_DLQ_TOPIC || 'im.events.dlq').trim();
const outboxPartitions = Number(process.env.OUTBOX_TOPIC_PARTITIONS || 6);
const dlqPartitions = Number(process.env.OUTBOX_DLQ_TOPIC_PARTITIONS || 6);
const replicationFactor = Number(process.env.OUTBOX_TOPIC_REPLICATION_FACTOR || 1);

async function run() {
  const kafka = new Kafka({
    brokers: kafkaBrokers,
    clientId: 'nodeadmin-topic-bootstrap',
  });
  const admin = kafka.admin();

  await admin.connect();
  try {
    await ensureTopic(admin, outboxTopic, outboxPartitions, replicationFactor);
    await ensureTopic(admin, dlqTopic, dlqPartitions, replicationFactor);

    const metadata = await admin.fetchTopicMetadata({
      topics: [outboxTopic, dlqTopic],
    });

    console.log(
      JSON.stringify(
        {
          replicationFactor,
          result: 'ok',
          topics: metadata.topics.map((topic) => ({
            name: topic.name,
            partitions: topic.partitions.length,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await admin.disconnect();
  }
}

async function ensureTopic(admin, topic, targetPartitions, replicationFactor) {
  const existingTopics = await admin.listTopics();

  if (!existingTopics.includes(topic)) {
    await admin.createTopics({
      topics: [
        {
          topic,
          numPartitions: targetPartitions,
          replicationFactor,
        },
      ],
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
    topicPartitions: [
      {
        count: targetPartitions,
        topic,
      },
    ],
    validateOnly: false,
  });
}

run().catch((error) => {
  console.error('[bootstrapKafkaTopics] failed:', error);
  process.exit(1);
});
