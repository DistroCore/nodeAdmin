#!/usr/bin/env node
/**
 * Test script to verify frontend environment variables are accessible
 */

const http = require('http');

async function testFrontendEnv() {
  console.log('Testing frontend environment configuration...\n');

  // Test 1: Check if dev server is running
  console.log('1. Checking if dev server is running on port 5173...');
  try {
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:5173', (res) => {
        if (res.statusCode === 200) {
          console.log('   ✓ Dev server is running\n');
          resolve();
        } else {
          reject(new Error(`Server returned status ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Request timeout')));
    });
  } catch (error) {
    console.error('   ✗ Dev server is not responding:', error.message);
    process.exit(1);
  }

  // Test 2: Verify .env file exists and has required variables
  console.log('2. Verifying .env file configuration...');
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', 'Apps', 'AdminPortal', '.env');

  if (!fs.existsSync(envPath)) {
    console.error('   ✗ .env file not found at:', envPath);
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const requiredVars = [
    'VITE_CORE_API_BASE_URL',
    'VITE_CORE_API_SOCKET_URL',
    'VITE_IM_TENANT_ID',
    'VITE_IM_USER_ID',
    'VITE_IM_CONVERSATION_ID',
    'VITE_IM_ROLES',
  ];

  const missingVars = [];
  for (const varName of requiredVars) {
    const regex = new RegExp(`^${varName}=.+`, 'm');
    if (!regex.test(envContent)) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    console.error('   ✗ Missing required variables:', missingVars.join(', '));
    process.exit(1);
  }

  console.log('   ✓ All required environment variables are present\n');

  console.log('3. Environment configuration summary:');
  const lines = envContent.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  lines.forEach((line) => {
    const [key, value] = line.split('=');
    if (key && value) {
      console.log(`   ${key}: ${value}`);
    }
  });

  console.log('\n✓ Frontend environment configuration is correct!');
  console.log('\nNext steps:');
  console.log('  - Open http://localhost:5173 in your browser');
  console.log('  - Check browser console for any "Missing IM runtime config" errors');
  console.log('  - If error persists, try hard refresh (Ctrl+Shift+R)');
}

testFrontendEnv().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
