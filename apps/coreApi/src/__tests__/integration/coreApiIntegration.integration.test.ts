import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';

import { createIntegrationContext, type IntegrationContext } from './integrationHarness';

describe.sequential('CoreApi integration', () => {
  let context: IntegrationContext;

  beforeAll(async () => {
    context = await createIntegrationContext();
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  it('covers the auth flow: register, login, refresh, change password, and re-login', async () => {
    const email = `${context.uniqueId('auth')}@example.com`;
    const password = 'InitialP@ssword1';
    const nextPassword = 'UpdatedP@ssword2';

    const registerResponse = await context.http.post('/api/v1/auth/register').send({
      email,
      name: 'Integration Auth User',
      password,
      tenantId: 'default',
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.identity.tenantId).toBe('default');

    const loginResponse = await context.http.post('/api/v1/auth/login').send({
      email,
      password,
      tenantId: 'default',
    });

    expect(loginResponse.status).toBe(201);
    expect(loginResponse.body.accessToken).toBeTypeOf('string');
    expect(loginResponse.body.refreshToken).toBeTypeOf('string');

    const refreshResponse = await context.http.post('/api/v1/auth/refresh').send({
      refreshToken: loginResponse.body.refreshToken,
    });

    expect(refreshResponse.status).toBe(201);
    expect(refreshResponse.body.accessToken).toBeTypeOf('string');

    const changePasswordResponse = await context.http
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .send({
        currentPassword: password,
        newPassword: nextPassword,
      });

    expect(changePasswordResponse.status).toBe(201);
    expect(changePasswordResponse.body).toEqual({ success: true });

    const oldPasswordLogin = await context.http.post('/api/v1/auth/login').send({
      email,
      password,
      tenantId: 'default',
    });

    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await context.http.post('/api/v1/auth/login').send({
      email,
      password: nextPassword,
      tenantId: 'default',
    });

    expect(newPasswordLogin.status).toBe(201);
    expect(newPasswordLogin.body.identity.userId).toBe(registerResponse.body.identity.userId);
  });

  it('covers the users CRUD flow through HTTP endpoints', async () => {
    const accessToken = await context.issueDevToken(context.uniqueId('crud-admin'));
    const email = `${context.uniqueId('crud')}@example.com`;

    const createResponse = await context.http
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email,
        name: 'CRUD User',
        password: 'UserP@ssword1',
        tenantId: 'default',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.email).toBe(email);
    const userId = createResponse.body.id as string;

    const listResponse = await context.http
      .get('/api/v1/users')
      .query({ tenantId: 'default', search: email })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items.some((item: { id: string }) => item.id === userId)).toBe(true);

    const getResponse = await context.http
      .get(`/api/v1/users/${userId}`)
      .query({ tenantId: 'default' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(userId);

    const updateResponse = await context.http
      .patch(`/api/v1/users/${userId}`)
      .query({ tenantId: 'default' })
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        isActive: true,
        name: 'CRUD User Updated',
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.name).toBe('CRUD User Updated');

    const deleteResponse = await context.http
      .delete(`/api/v1/users/${userId}`)
      .query({ tenantId: 'default' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });

    const missingResponse = await context.http
      .get(`/api/v1/users/${userId}`)
      .query({ tenantId: 'default' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(missingResponse.status).toBe(404);
  });

  it('covers IM websocket join and message delivery', async () => {
    const senderToken = await context.issueDevToken(context.uniqueId('im-sender'), ['im:operator']);
    const receiverToken = await context.issueDevToken(context.uniqueId('im-receiver'), [
      'im:operator',
    ]);
    const conversationId = context.uniqueId('conversation');
    const messageId = context.uniqueId('message');
    const traceId = context.uniqueId('trace');

    const sender = await connectSocket(context.baseUrl, senderToken);
    const receiver = await connectSocket(context.baseUrl, receiverToken);

    try {
      const receiverMessage = waitForEvent(
        receiver,
        'messageReceived',
        (payload: { messageId?: string }) => payload?.messageId === messageId
      );

      await emitWithAck(sender, 'joinConversation', { conversationId });
      await emitWithAck(receiver, 'joinConversation', { conversationId });

      const sendAck = await emitWithAck(sender, 'sendMessage', {
        content: 'Integration websocket message',
        conversationId,
        messageId,
        traceId,
      });

      expect(sendAck.accepted).toBe(true);
      expect(sendAck.duplicate).toBe(false);

      const deliveredMessage = await receiverMessage;

      expect(deliveredMessage.messageId).toBe(messageId);
      expect(deliveredMessage.conversationId).toBe(conversationId);
    } finally {
      sender.disconnect();
      receiver.disconnect();
    }
  });

  it('verifies auth-level multi-tenant isolation', async () => {
    const tenantSlug = context.uniqueId('tenant');
    const sharedEmail = `${context.uniqueId('tenant-user')}@example.com`;

    const tenantResponse = await context.http.post('/api/v1/tenants').send({
      name: 'Integration Tenant',
      slug: tenantSlug,
    });

    expect(tenantResponse.status).toBe(201);

    const tenantId = tenantResponse.body.id as string;
    const defaultPassword = 'DefaultTenantP@ss1';
    const isolatedPassword = 'IsolatedTenantP@ss2';

    const defaultRegister = await context.http.post('/api/v1/auth/register').send({
      email: sharedEmail,
      password: defaultPassword,
      tenantId: 'default',
    });
    expect(defaultRegister.status).toBe(201);

    const isolatedRegister = await context.http.post('/api/v1/auth/register').send({
      email: sharedEmail,
      password: isolatedPassword,
      tenantId,
    });
    expect(isolatedRegister.status).toBe(201);

    const defaultLogin = await context.http.post('/api/v1/auth/login').send({
      email: sharedEmail,
      password: defaultPassword,
      tenantId: 'default',
    });
    expect(defaultLogin.status).toBe(201);

    const isolatedLogin = await context.http.post('/api/v1/auth/login').send({
      email: sharedEmail,
      password: isolatedPassword,
      tenantId,
    });
    expect(isolatedLogin.status).toBe(201);

    const crossTenantLogin = await context.http.post('/api/v1/auth/login').send({
      email: sharedEmail,
      password: isolatedPassword,
      tenantId: 'default',
    });
    expect(crossTenantLogin.status).toBe(401);
  });

  it('covers auth + users by disabling a created user and preventing future logins', async () => {
    const adminToken = await context.issueDevToken(context.uniqueId('admin-user'));
    const email = `${context.uniqueId('managed-user')}@example.com`;
    const password = 'ManagedUserP@ss1';

    const createResponse = await context.http
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        name: 'Managed User',
        password,
        tenantId: 'default',
      });

    expect(createResponse.status).toBe(201);
    const userId = createResponse.body.id as string;

    const loginResponse = await context.http.post('/api/v1/auth/login').send({
      email,
      password,
      tenantId: 'default',
    });
    expect(loginResponse.status).toBe(201);

    const disableResponse = await context.http
      .patch(`/api/v1/users/${userId}`)
      .query({ tenantId: 'default' })
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        isActive: false,
      });

    expect(disableResponse.status).toBe(200);
    expect(disableResponse.body.is_active).toBe(0);

    const disabledLogin = await context.http.post('/api/v1/auth/login').send({
      email,
      password,
      tenantId: 'default',
    });

    expect(disabledLogin.status).toBe(401);
  });

  it('covers auth + tenants by creating tenant-scoped users and querying them within that tenant', async () => {
    const tenantResponse = await context.http.post('/api/v1/tenants').send({
      name: 'Scoped Tenant',
      slug: context.uniqueId('scoped-tenant'),
    });

    expect(tenantResponse.status).toBe(201);
    const tenantId = tenantResponse.body.id as string;
    const tenantAdminToken = await context.issueDevToken(
      context.uniqueId('tenant-admin'),
      ['admin'],
      tenantId
    );
    const email = `${context.uniqueId('tenant-user')}@example.com`;

    const createUserResponse = await context.http
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({
        email,
        name: 'Tenant Scoped User',
        password: 'TenantScopedP@ss1',
        tenantId,
      });

    expect(createUserResponse.status).toBe(201);

    const listResponse = await context.http
      .get('/api/v1/users')
      .query({ tenantId, search: email })
      .set('Authorization', `Bearer ${tenantAdminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items.some((item: { email: string }) => item.email === email)).toBe(
      true
    );
  });

  it('covers permissions + roles by assigning seeded permissions to a new role', async () => {
    const adminToken = await context.issueDevToken(context.uniqueId('roles-admin'));

    const permissionsResponse = await context.http
      .get('/api/v1/permissions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(permissionsResponse.status).toBe(200);
    expect(Array.isArray(permissionsResponse.body)).toBe(true);
    expect(permissionsResponse.body.length).toBeGreaterThan(0);

    const permissionIds = permissionsResponse.body
      .slice(0, 2)
      .map((permission: { id: string }) => permission.id);

    const createRoleResponse = await context.http
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Integration role',
        name: context.uniqueId('integration-role'),
        permissionIds,
        tenantId: 'default',
      });

    expect(createRoleResponse.status).toBe(201);
    const roleId = createRoleResponse.body.id as string;

    const roleResponse = await context.http
      .get(`/api/v1/roles/${roleId}`)
      .query({ tenantId: 'default' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(roleResponse.status).toBe(200);
    expect(
      roleResponse.body.permissions.map((permission: { id: string }) => permission.id)
    ).toEqual(expect.arrayContaining(permissionIds));
  });
});

async function connectSocket(baseUrl: string, token: string): Promise<Socket> {
  const socket = io(baseUrl, {
    auth: {
      token,
    },
    reconnection: false,
    transports: ['websocket'],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Socket connection timed out.'));
    }, 5000);

    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return socket;
}

async function emitWithAck<TPayload extends object, TAck>(
  socket: Socket,
  eventName: string,
  payload: TPayload
): Promise<TAck> {
  return await new Promise<TAck>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Socket ack timed out for ${eventName}.`));
    }, 5000);

    socket.emit(eventName, payload, (ack: TAck) => {
      clearTimeout(timeout);
      resolve(ack);
    });
  });
}

async function waitForEvent<TPayload>(
  socket: Socket,
  eventName: string,
  predicate: (payload: TPayload) => boolean
): Promise<TPayload> {
  return await new Promise<TPayload>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, 5000);

    const listener = (payload: TPayload) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(eventName, listener);
      resolve(payload);
    };

    socket.on(eventName, listener);
  });
}
