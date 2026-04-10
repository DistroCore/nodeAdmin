#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

const composeArgs = ['-f', 'docker-compose.yml', '-f', 'infra/docker-compose.yml'];
const profileArgs = ['--profile', 'phase2-redis-cluster'];

function run() {
  execFileSync(
    'docker',
    [
      'compose',
      ...composeArgs,
      ...profileArgs,
      'up',
      '-d',
      'redis-cluster-node-1',
      'redis-cluster-node-2',
      'redis-cluster-node-3',
      'redis-cluster-node-4',
      'redis-cluster-node-5',
      'redis-cluster-node-6',
      'redis-cluster-init',
    ],
    { stdio: 'inherit' },
  );

  const clusterInfo = waitForHealthyCluster();

  const nodes = execFileSync(
    'docker',
    [
      'compose',
      ...composeArgs,
      ...profileArgs,
      'exec',
      '-T',
      'redis-cluster-node-1',
      'redis-cli',
      '-p',
      '7001',
      'cluster',
      'nodes',
    ],
    { encoding: 'utf8' },
  );

  if (!clusterInfo.includes('cluster_state:ok')) {
    throw new Error(`Redis cluster is not healthy.\n${clusterInfo}`);
  }

  const nodeCount = nodes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;

  console.log(
    JSON.stringify(
      {
        clusterInfo: clusterInfo.trim().split('\n'),
        nodeCount,
        result: 'ok',
      },
      null,
      2,
    ),
  );
}

function waitForHealthyCluster() {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const clusterInfo = execFileSync(
      'docker',
      [
        'compose',
        ...composeArgs,
        ...profileArgs,
        'exec',
        '-T',
        'redis-cluster-node-1',
        'redis-cli',
        '-p',
        '7001',
        'cluster',
        'info',
      ],
      { encoding: 'utf8' },
    );

    if (clusterInfo.includes('cluster_state:ok')) {
      return clusterInfo;
    }

    execFileSync('sleep', ['1']);
  }

  throw new Error('Timed out waiting for Redis cluster health.');
}

try {
  run();
} catch (error) {
  console.error('[verifyRedisCluster] failed:', error);
  process.exit(1);
}
