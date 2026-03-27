#!/usr/bin/env node
/**
 * IM Module Integration Test Suite v2
 * Matches actual API implementation: WebSocket events (joinConversation, sendMessage, typing)
 */

const http = require('http');
const { io } = require('socket.io-client');

const API_BASE = 'http://localhost:3001';
const SOCKET_URL = 'http://localhost:3001';

const testResults = [];

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function logTest(name, expected, actual, pass, details = '') {
  testResults.push({ name, expected, actual, pass, details, timestamp: new Date().toISOString() });
  const status = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`\n${status} | ${name}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual: ${actual}`);
  if (details) console.log(`  Details: ${details}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test 1: Authentication
async function testAuthentication() {
  console.log('\n=== TEST 1: Authentication ===');
  try {
    const response = await httpRequest(
      {
        hostname: 'localhost',
        port: 3001,
        path: '/api/v1/auth/dev-token',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        tenantId: 'tenant-demo',
        userId: 'user-admin',
        roles: ['tenant:admin', 'im:operator'],
      }
    );

    const pass = response.status === 201 && response.body?.accessToken;
    logTest(
      'Authentication - Dev Token',
      'HTTP 201 with accessToken',
      `HTTP ${response.status} ${response.body?.accessToken ? 'with token' : 'no token'}`,
      pass,
      response.body?.accessToken
        ? `Token: ${response.body.accessToken.substring(0, 20)}...`
        : 'No token'
    );

    return pass ? response.body.accessToken : null;
  } catch (error) {
    logTest('Authentication - Dev Token', 'HTTP 201', `Error: ${error.message}`, false);
    return null;
  }
}

// Test 2: WebSocket Connection
async function testWebSocketConnection(token) {
  console.log('\n=== TEST 2: WebSocket Connection ===');
  return new Promise((resolve) => {
    try {
      const socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      const timeout = setTimeout(() => {
        socket.close();
        logTest('WebSocket Connection', 'Connected', 'Timeout after 5s', false);
        resolve(null);
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        logTest('WebSocket Connection', 'Connected', 'Connected', true, `Socket ID: ${socket.id}`);
        resolve(socket);
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        logTest('WebSocket Connection', 'Connected', `Error: ${error.message}`, false);
        resolve(null);
      });
    } catch (error) {
      logTest('WebSocket Connection', 'Connected', `Exception: ${error.message}`, false);
      resolve(null);
    }
  });
}

// Test 3: Conversation API
async function testConversationAPI(token) {
  console.log('\n=== TEST 3: Conversation API ===');
  try {
    const response = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/v1/console/conversations?tenantId=tenant-demo',
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const pass = response.status === 200 && Array.isArray(response.body);
    logTest(
      'Conversation API - List',
      'HTTP 200 with array',
      `HTTP ${response.status} ${Array.isArray(response.body) ? `with ${response.body.length} conversations` : 'invalid'}`,
      pass,
      pass ? `Conversations: ${response.body.length}` : JSON.stringify(response.body)
    );

    return pass ? response.body : [];
  } catch (error) {
    logTest('Conversation API - List', 'HTTP 200', `Error: ${error.message}`, false);
    return [];
  }
}

// Test 4: Join Conversation via WebSocket
async function testJoinConversation(socket, conversationId) {
  console.log('\n=== TEST 4: Join Conversation ===');
  return new Promise((resolve) => {
    if (!socket || !conversationId) {
      logTest(
        'Join Conversation',
        'Joined successfully',
        'Skipped - no socket or conversation',
        false
      );
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      logTest('Join Conversation', 'Acknowledgment received', 'Timeout after 5s', false);
      resolve(false);
    }, 5000);

    socket.emit('joinConversation', { conversationId }, (ack) => {
      clearTimeout(timeout);
      const pass = ack && ack.ok;
      logTest(
        'Join Conversation',
        'Acknowledgment with ok:true',
        pass ? `Joined room: ${ack.roomKey}` : `Error: ${JSON.stringify(ack)}`,
        pass,
        JSON.stringify(ack)
      );
      resolve(pass);
    });
  });
}

// Test 5: Send Message via WebSocket
async function testSendMessage(socket, conversationId) {
  console.log('\n=== TEST 5: Send Message ===');
  return new Promise((resolve) => {
    if (!socket || !conversationId) {
      logTest('Send Message', 'Message sent', 'Skipped - no socket or conversation', false);
      resolve(false);
      return;
    }

    const messageId = `msg-test-${Date.now()}`;
    const timeout = setTimeout(() => {
      logTest('Send Message', 'Acknowledgment received', 'Timeout after 5s', false);
      resolve(false);
    }, 5000);

    socket.emit(
      'sendMessage',
      {
        conversationId,
        messageId,
        content: 'Integration test message',
        messageType: 'text',
        traceId: `trace-${Date.now()}`,
      },
      (ack) => {
        clearTimeout(timeout);
        const pass = ack && ack.accepted;
        logTest(
          'Send Message',
          'Acknowledgment with accepted:true',
          pass ? `Message sent, sequenceId: ${ack.sequenceId}` : `Error: ${JSON.stringify(ack)}`,
          pass,
          JSON.stringify(ack)
        );
        resolve(pass);
      }
    );
  });
}

// Test 6: Receive Message
async function testReceiveMessage(socket, conversationId) {
  console.log('\n=== TEST 6: Receive Message ===');
  return new Promise((resolve) => {
    if (!socket || !conversationId) {
      logTest('Receive Message', 'Message received', 'Skipped - no socket or conversation', false);
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      socket.off('messageReceived');
      logTest('Receive Message', 'Message received', 'Timeout after 5s', false);
      resolve(false);
    }, 5000);

    socket.on('messageReceived', (message) => {
      clearTimeout(timeout);
      socket.off('messageReceived');
      const pass = message && message.conversationId === conversationId;
      logTest(
        'Receive Message',
        'Message received',
        pass ? `Received message: ${message.messageId}` : 'Invalid message',
        pass,
        JSON.stringify(message)
      );
      resolve(pass);
    });

    // Trigger a message
    socket.emit('sendMessage', {
      conversationId,
      messageId: `msg-receive-${Date.now()}`,
      content: 'Test receive message',
      messageType: 'text',
      traceId: `trace-${Date.now()}`,
    });
  });
}

// Test 7: Typing Indicators
async function testTypingIndicators(socket, conversationId) {
  console.log('\n=== TEST 7: Typing Indicators ===');
  return new Promise((resolve) => {
    if (!socket || !conversationId) {
      logTest(
        'Typing Indicators',
        'Typing event received',
        'Skipped - no socket or conversation',
        false
      );
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      socket.off('typingChanged');
      logTest('Typing Indicators', 'Typing event sent', 'Timeout after 5s', false);
      resolve(false);
    }, 5000);

    socket.emit(
      'typing',
      {
        conversationId,
        isTyping: true,
      },
      (ack) => {
        clearTimeout(timeout);
        const pass = ack && ack.ok;
        logTest(
          'Typing Indicators',
          'Acknowledgment with ok:true',
          pass ? 'Typing event sent' : `Error: ${JSON.stringify(ack)}`,
          pass,
          JSON.stringify(ack)
        );
        resolve(pass);
      }
    );
  });
}

// Test 8: Presence - Join Event
async function testPresenceJoin(socket, conversationId) {
  console.log('\n=== TEST 8: Presence - Join Event ===');
  return new Promise(async (resolve) => {
    if (!socket || !conversationId) {
      logTest('Presence Join', 'Join event received', 'Skipped - no socket or conversation', false);
      resolve(false);
      return;
    }

    // Create second socket to observe presence
    const socket2 = io(SOCKET_URL, {
      auth: { token: socket.auth.token },
      transports: ['websocket'],
      reconnection: false,
    });

    const timeout = setTimeout(() => {
      socket2.close();
      socket2.off('presenceChanged');
      logTest('Presence Join', 'Join event received', 'Timeout after 5s', false);
      resolve(false);
    }, 5000);

    socket2.on('connect', () => {
      // First socket joins, second socket should receive presence event
      socket2.emit('joinConversation', { conversationId }, () => {
        socket2.on('presenceChanged', (event) => {
          clearTimeout(timeout);
          socket2.close();
          const pass = event && event.userId;
          logTest(
            'Presence Join',
            'Join event received',
            pass ? `User joined: ${event.userId}` : 'Invalid event',
            pass,
            JSON.stringify(event)
          );
          resolve(pass);
        });

        // Trigger join from first socket
        socket.emit('joinConversation', { conversationId });
      });
    });

    socket2.on('connect_error', () => {
      clearTimeout(timeout);
      logTest('Presence Join', 'Second socket connected', 'Connection error', false);
      resolve(false);
    });
  });
}

// Test 9: Presence - Leave Event
async function testPresenceLeave(socket, conversationId) {
  console.log('\n=== TEST 9: Presence - Leave Event ===');
  return new Promise((resolve) => {
    if (!socket || !conversationId) {
      logTest(
        'Presence Leave',
        'Leave event received',
        'Skipped - no socket or conversation',
        false
      );
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      socket.off('presenceChanged');
      logTest('Presence Leave', 'Leave event on disconnect', 'Timeout after 5s', false);
      resolve(false);
    }, 5000);

    // Create temporary socket
    const tempSocket = io(SOCKET_URL, {
      auth: { token: socket.auth.token },
      transports: ['websocket'],
      reconnection: false,
    });

    tempSocket.on('connect', () => {
      tempSocket.emit('joinConversation', { conversationId }, () => {
        // Main socket should receive leave event when temp disconnects
        socket.on('presenceChanged', (event) => {
          clearTimeout(timeout);
          socket.off('presenceChanged');
          const pass = event && event.userId;
          logTest(
            'Presence Leave',
            'Leave event received',
            pass ? `User left: ${event.userId}` : 'Invalid event',
            pass,
            JSON.stringify(event)
          );
          resolve(pass);
        });

        // Disconnect temp socket
        setTimeout(() => tempSocket.close(), 500);
      });
    });
  });
}

// Test 10: Conversation History
async function testConversationHistory(socket, conversationId) {
  console.log('\n=== TEST 10: Conversation History ===');
  return new Promise((resolve) => {
    if (!socket || !conversationId) {
      logTest(
        'Conversation History',
        'History received',
        'Skipped - no socket or conversation',
        false
      );
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      socket.off('conversationHistory');
      logTest('Conversation History', 'History received', 'Timeout after 5s', false);
      resolve(false);
    }, 5000);

    socket.on('conversationHistory', (history) => {
      clearTimeout(timeout);
      socket.off('conversationHistory');
      const pass = Array.isArray(history);
      logTest(
        'Conversation History',
        'History array received',
        pass ? `Received ${history.length} messages` : 'Invalid history',
        pass,
        `Messages: ${history.length}`
      );
      resolve(pass);
    });

    // Join conversation to trigger history
    socket.emit('joinConversation', { conversationId });
  });
}

// Main test runner
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   IM Module Integration Test Suite v2                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Started at: ${new Date().toISOString()}`);

  let token = null;
  let socket = null;
  let conversationId = null;

  try {
    // Test 1: Authentication
    token = await testAuthentication();
    if (!token) {
      console.log('\n⚠ Authentication failed. Stopping tests.');
      printSummary();
      process.exit(1);
    }

    // Test 2: WebSocket Connection
    socket = await testWebSocketConnection(token);
    if (!socket) {
      console.log('\n⚠ WebSocket connection failed. Stopping tests.');
      printSummary();
      process.exit(1);
    }

    // Test 3: Conversation API
    const conversations = await testConversationAPI(token);
    if (conversations.length > 0) {
      conversationId = conversations[0].conversationId;
      console.log(`\nUsing conversation: ${conversationId}`);
    } else {
      console.log('\n⚠ No conversations available. Some tests will be skipped.');
    }

    // Test 4: Join Conversation
    await testJoinConversation(socket, conversationId);
    await wait(500);

    // Test 5: Send Message
    await testSendMessage(socket, conversationId);
    await wait(500);

    // Test 6: Receive Message
    await testReceiveMessage(socket, conversationId);
    await wait(500);

    // Test 7: Typing Indicators
    await testTypingIndicators(socket, conversationId);
    await wait(500);

    // Test 8: Presence Join
    await testPresenceJoin(socket, conversationId);
    await wait(500);

    // Test 9: Presence Leave
    await testPresenceLeave(socket, conversationId);
    await wait(500);

    // Test 10: Conversation History
    await testConversationHistory(socket, conversationId);

    // Cleanup
    if (socket) socket.close();
  } catch (error) {
    console.error('\n❌ Test suite error:', error);
  }

  printSummary();

  const failedTests = testResults.filter((t) => !t.pass).length;
  process.exit(failedTests > 0 ? 1 : 0);
}

function printSummary() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                     TEST SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const passed = testResults.filter((t) => t.pass).length;
  const failed = testResults.filter((t) => !t.pass).length;
  const total = testResults.length;

  console.log(`\nTotal Tests: ${total}`);
  console.log(`Passed: ${passed} ✓`);
  console.log(`Failed: ${failed} ✗`);
  console.log(`Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults
      .filter((t) => !t.pass)
      .forEach((t) => {
        console.log(`  - ${t.name}`);
        console.log(`    Expected: ${t.expected}`);
        console.log(`    Actual: ${t.actual}`);
      });
  }

  console.log(`\nCompleted at: ${new Date().toISOString()}`);
}

runTests().catch(console.error);
