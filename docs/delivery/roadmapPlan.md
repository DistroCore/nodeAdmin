# 实施路线图（默认方案）

## 1. 默认前提

- IM 场景：内部协作。
- 目标规模：1 万同时在线。
- 消息中间件：`Kafka`。
- 租户模型：共享库 + `RLS`。
- 消息留存：1 年。
- 客户端范围：Web 优先。

---

## 2. 0-30 天（基线交付）- 详细检查点

### 2.1 工程脚手架

- [x] Monorepo 结构验证（`apps/`、`packages/`）
- [x] core-api NestJS 项目完整配置
- [x] admin-portal React + shadcn/ui 项目创建
- [x] shared-types 共享类型包创建
- [x] ESLint + Prettier 命名规范规则（目录 lowercase、文件 lowerCamelCase）
- [x] Git hook + PR 检查配置

### 2.2 基础设施增补

| 检查项 | 原因 | 优先级 |
|--------|------|--------|
| [x] PostgreSQL 连接池上限配置 | 默认 10 连接，1万在线时瞬间打满 | 🔴 P0 |
| [x] Redis Cluster 模式预研 | 单机 Redis 在 Phase 2 横向扩展时会成为瓶颈 | 🟡 P1 |
| [x] Kafka Topic 分区数 ≥ 3 | 为后续水平扩展预留，避免重新分区 | 🔴 P0 |
| [x] 数据库索引基线 | `conversation_id + created_at`, `user_id + last_read_at` | 🔴 P0 |
| [x] Docker Compose 环境完整配置 | PostgreSQL + pgbouncer + Redis + Kafka + Zookeeper | 🔴 P0 |

### 2.3 认证与租户

- [x] `identityAuthService` - 登录/注册/令牌/Refresh Token
- [x] `tenantRbacService` - 租户/角色/权限
- [x] RLS (Row Level Security) 策略配置
- [x] JWT Guard + Tenant Context 注入
- [x] 审计日志基础（登录、权限变更）

### 2.4 IM 核心链路增补

```typescript
// 必须验证的边界场景
- [x] 消息顺序号（Sequence ID）在分布式下的单调递增
- [x] Socket.IO 节点重启时的会话迁移（Redis 适配器预置）
- [x] 消息去重键（client_message_id）唯一索引
- [x] 大消息体截断（>1MB 拒绝或分片）
- [x] 消息体大小校验中间件（防大文件攻击）
```

**服务模块**：
- [x] `imConversationService` - 会话管理（单人/群组）
- [x] `imMessageService` - 消息写入、顺序号、Outbox
- [x] `imDeliveryService` - Socket.IO 投递、ACK 机制
- [x] `imPresenceService` - 在线状态、心跳、设备状态
- [x] Outbox 模式 + Kafka 异步分发
- [x] Socket.IO 配置：`perMessageDeflate: false`（1万在线时压缩 CPU 开销巨大）

### 2.5 前端基线增补

- [x] Tailwind 设计令牌配置
- [x] shadcn/ui 基础组件（`Src/Components/Ui/`）
- [x] 登录/注册页面
- [x] 会话列表组件（虚拟滚动：react-window，>50 条时启用）
- [x] 聊天窗口组件（`Src/Components/Business/`）
- [x] 输入防抖：消息输入框 300ms 防抖
- [x] 重连 UI 状态：断线时显示"连接中..."
- [x] Socket.IO 客户端集成

### 2.6 可观测基线

- [x] OpenTelemetry trace + log 集成
- [x] 结构化日志（traceId 强制关联）
- [x] 基础指标采集（延迟、错误率、队列积压、重试次数）
- [x] IM 指标增补（连接数、在线人数、消息吞吐、投递时延）
- [x] 健康检查端点
- [x] 错误告警规则

---

## 3. Phase 1 → Phase 2 关键门槛

在进入 Phase 2 前，必须确认以下数据：

| 指标 | 目标值 | 验证方式 |
|------|--------|----------|
| 单节点 Socket.IO 承载上限 | 5000 并发连接 | 压测 |
| 消息端到端延迟 P99 | < 200ms | 同机房测试 |
| 消息丢失率 | 0 | ACK 机制验证 |
| 数据库 CPU 峰值 | < 50% | 监控 |

---

## 4. 容量预判（1万在线目标）

| 组件 | Phase 1 配置 | Phase 2 扩展 |
|------|--------------|--------------|
| Socket.IO | 单节点 4C8G | 3 节点 + Redis Adapter |
| PostgreSQL | 4C8G 主从 | 读写分离 / 分库分表评估 |
| Redis | 2G 主从 | Cluster 6 节点 |
| Kafka | 3 节点 × 2C4G | 分区扩展到 6-12 |

---

## 5. 31-60 天（可靠性增强）

- [x] 接入 `Redis Adapter` 横向扩展。
- [x] 完成 outbox + Kafka 异步分发。
- [x] 增加 ACK、重试、死信队列处理。
- [x] 增加离线消息补拉与断线重连策略。
- [x] 执行专项压测并输出容量基线。
- [x] 幂等性测试覆盖。
- [x] Socket.IO 多节点负载均衡验证。

---

## 6. 61-90 天（企业能力完善）

- [x] 完成群聊、回执、会话搜索能力。
- [x] 加入审计能力与权限变更追踪。
- [x] 完成安全加固（限流、风控、越权测试）。
- [x] 完成容灾演练与发布回滚预案。
- [x] 发布 SLA 指标看板与运维值守手册。

---

## 7. 里程碑验收标准

| 里程碑 | 标准 | 状态 |
|--------|------|------|
| **M1 可用** | 主链路打通，核心 API 稳定，Phase 1 → Phase 2 门槛指标全部通过 | ✅ 通过 |
| **M2 可靠** | 幂等、重试、告警、压测通过 | ✅ 通过 |
| **M3 可运营** | 审计、容灾、SLA、值守机制到位 | ✅ 通过 |

---

## 8. 本周可执行的 3 个动作（已完成）

1. **[x]** Docker Compose 中加入 `pgbouncer`，提前验证连接池行为
2. **[x]** Socket.IO 启用 `perMessageDeflate: false`（1万在线时压缩 CPU 开销巨大）
3. **[x]** 在 `imMessageService` 中加入消息体大小校验（防大文件攻击）

---

## 9. 最近更新时间

- 2026-03-01（全量完成标记同步，Docker 全栈部署验证，全量测试通过）
- 2026-02-28（基础设施增补、容量预判、关键门槛指标）
