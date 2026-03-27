# 架构基线（Node 中台 + IM）

## 1. 架构目标

- 支撑企业中台能力与 IM 统一平台化。
- 满足多租户、可扩展、可观测、可审计。
- 先保证稳定交付，再逐步增强复杂能力。

## 2. 技术基线

- 后端：`Node.js + NestJS + Fastify`
- 前端：`React + TypeScript + Tailwind CSS + shadcn/ui`
- 实时通信：`Socket.IO + Redis Adapter`
- 主数据：`PostgreSQL`
- 缓存与在线态：`Redis`
- 异步总线：`Kafka`
- 可观测：`OpenTelemetry`

## 3. 服务边界（第一期）

- `gatewayService`：统一入口（HTTP + WebSocket）
- `identityAuthService`：认证、令牌、会话
- `tenantRbacService`：租户、组织、角色权限
- `imConversationService`：会话与群组管理
- `imMessageService`：消息写入、顺序号、outbox
- `imDeliveryService`：投递、ACK、重试、死信
- `imPresenceService`：在线态、心跳、设备状态
- `notificationService`：站内与外部通知

## 4. 关键数据与消息原则

- 所有事件强制带：`tenantId`、`conversationId`、`messageId`、`traceId`。
- 消息语义按业务采用 at-least-once，消费侧必须幂等。
- 仅保证“会话内有序”，不保证全局有序。
- 禁止双写，统一走数据库事务 outbox。

## 5. 多租户与安全

- 租户模型：共享数据库 + `RLS`。
- 每张核心业务表都包含 `tenantId`。
- 网关层注入租户上下文，服务层不得缺失租户校验。
- 审计日志覆盖：登录、权限变更、消息关键操作。

## 6. 可观测与运维基线

- 所有服务打通 trace 与 log 关联。
- 指标至少包含：请求延迟、错误率、队列积压、重试次数。
- 针对 IM 增补指标：连接数、在线人数、消息吞吐、投递时延。

## 7. 约束引用

- 命名与目录约束：`docs/platformSpec.md`
- 治理与维护流程：`docs/governance/docGovernance.md`、`docs/governance/docMaintenance.md`

## 8. 最近更新时间

- 2026-02-28
