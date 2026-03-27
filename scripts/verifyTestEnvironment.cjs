#!/usr/bin/env node

/**
 * Test Environment Verification Script
 *
 * Verifies that all infrastructure components are properly configured
 * before running load tests. Checks:
 * - PgBouncer configuration (max_client_conn, default_pool_size)
 * - PostgreSQL connection pool settings
 * - Redis connectivity
 * - CoreApi health endpoint
 */

const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const http = require('node:http');

const execAsync = promisify(exec);

const CORE_API_BASE_URL = process.env.CORE_API_BASE_URL || 'http://127.0.0.1:3001';
const PGBOUNCER_HOST = process.env.PGBOUNCER_HOST || '127.0.0.1';
const PGBOUNCER_PORT = process.env.PGBOUNCER_PORT || '6432';

const checks = {
  passed: [],
  failed: [],
  warnings: [],
};

async function main() {
  console.log('🔍 Test Environment Verification\n');
  console.log('='.repeat(60));

  await checkDockerServices();
  await checkPgBouncerConfig();
  await checkCoreApiHealth();
  await checkRedisConnectivity();

  console.log('\n' + '='.repeat(60));
  printSummary();

  if (checks.failed.length > 0) {
    process.exit(1);
  }
}

async function checkDockerServices() {
  console.log('\n📦 Checking Docker Services...');

  try {
    const { stdout } = await execAsync('docker compose ps --format json');
    const services = stdout
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));

    const requiredServices = ['postgres', 'pgbouncer', 'redis'];
    const runningServices = services.filter((s) => s.State === 'running').map((s) => s.Service);

    for (const service of requiredServices) {
      if (runningServices.includes(service)) {
        pass(`✓ ${service} is running`);
      } else {
        fail(`✗ ${service} is not running`);
      }
    }
  } catch (error) {
    fail(`✗ Failed to check Docker services: ${error.message}`);
  }
}

async function checkPgBouncerConfig() {
  console.log('\n🔌 Checking PgBouncer Configuration...');

  try {
    // Check if PgBouncer container is running
    const { stdout: containerCheck } = await execAsync(
      'docker ps --filter "name=pgbouncer" --format "{{.Names}}"'
    );

    if (!containerCheck.trim()) {
      fail('✗ PgBouncer container not found');
      return;
    }

    const containerName = containerCheck.trim();

    // Check max_client_conn
    try {
      const { stdout: configOutput } = await execAsync(
        `docker exec ${containerName} cat /etc/pgbouncer/pgbouncer.ini`
      );

      const maxClientConnMatch = configOutput.match(/max_client_conn\s*=\s*(\d+)/);
      const defaultPoolSizeMatch = configOutput.match(/default_pool_size\s*=\s*(\d+)/);
      const minPoolSizeMatch = configOutput.match(/min_pool_size\s*=\s*(\d+)/);

      if (maxClientConnMatch) {
        const maxClientConn = parseInt(maxClientConnMatch[1], 10);
        if (maxClientConn >= 5000) {
          pass(`✓ max_client_conn = ${maxClientConn} (>= 5000)`);
        } else {
          warn(`⚠ max_client_conn = ${maxClientConn} (recommended >= 5000)`);
        }
      } else {
        warn('⚠ max_client_conn not found in config');
      }

      if (defaultPoolSizeMatch) {
        const defaultPoolSize = parseInt(defaultPoolSizeMatch[1], 10);
        if (defaultPoolSize >= 100) {
          pass(`✓ default_pool_size = ${defaultPoolSize} (>= 100)`);
        } else {
          warn(`⚠ default_pool_size = ${defaultPoolSize} (recommended >= 100)`);
        }
      } else {
        warn('⚠ default_pool_size not found in config');
      }

      if (minPoolSizeMatch) {
        const minPoolSize = parseInt(minPoolSizeMatch[1], 10);
        pass(`✓ min_pool_size = ${minPoolSize}`);
      }
    } catch (error) {
      fail(`✗ Failed to read PgBouncer config: ${error.message}`);
    }
  } catch (error) {
    fail(`✗ Failed to check PgBouncer: ${error.message}`);
  }
}

async function checkCoreApiHealth() {
  console.log('\n🏥 Checking CoreApi Health...');

  return new Promise((resolve) => {
    const url = new URL('/api/v1/health', CORE_API_BASE_URL);

    const req = http.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode === 200) {
        pass(`✓ CoreApi health check passed (${CORE_API_BASE_URL}/api/v1/health)`);
      } else {
        fail(`✗ CoreApi health check failed: HTTP ${res.statusCode}`);
      }
      resolve();
    });

    req.on('error', (error) => {
      fail(`✗ CoreApi not reachable: ${error.message}`);
      warn('  → Run: npm run dev:api');
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      fail('✗ CoreApi health check timeout');
      resolve();
    });
  });
}

async function checkRedisConnectivity() {
  console.log('\n🔴 Checking Redis Connectivity...');

  try {
    const { stdout } = await execAsync('docker exec nodeadmin-redis redis-cli ping');
    if (stdout.trim() === 'PONG') {
      pass('✓ Redis is responding');
    } else {
      fail('✗ Redis ping failed');
    }
  } catch (error) {
    fail(`✗ Failed to check Redis: ${error.message}`);
  }
}

function pass(message) {
  checks.passed.push(message);
  console.log(`  ${message}`);
}

function fail(message) {
  checks.failed.push(message);
  console.log(`  ${message}`);
}

function warn(message) {
  checks.warnings.push(message);
  console.log(`  ${message}`);
}

function printSummary() {
  console.log('\n📊 Summary:');
  console.log(`  ✓ Passed: ${checks.passed.length}`);
  console.log(`  ✗ Failed: ${checks.failed.length}`);
  console.log(`  ⚠ Warnings: ${checks.warnings.length}`);

  if (checks.failed.length > 0) {
    console.log('\n❌ Environment verification FAILED');
    console.log('   Please fix the issues above before running load tests.');
  } else if (checks.warnings.length > 0) {
    console.log('\n⚠️  Environment verification PASSED with warnings');
    console.log('   Consider addressing warnings for optimal performance.');
  } else {
    console.log('\n✅ Environment verification PASSED');
    console.log('   Ready to run load tests!');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
