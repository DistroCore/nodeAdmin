# Agent 微服务架构评审意见

> 评审对象：[agentMicroservicePlan.md](./agentMicroservicePlan.md)（Gemini 生成）
> 评审人：Claude Code（项目架构师视角）
> 日期：2026-04-06
>
> **Scope（2026-04-08 更新）**：见被评审文档的 Scope 说明。Agent 业务能力属于
> 下游 fork，不在 nodeAdmin 框架本身的路线图内。此评审保留作为架构推理的历史
> 参考；fork 启动实际开发时应当把修正后的方案搬到 fork 自己的 decisionLog。

## 总体评价

方案从零规划了一套微服务架构，但**未考虑 nodeAdmin 已有的基础设施**。中台部分与现有系统高度重叠（NestJS + Fastify + JWT + Redis + PostgreSQL + Docker 编排均已实现），建议最大化复用现有组件。

---

## 逐项评审

### 1. gRPC 通信 — 合理但需区分场景

**优点**：强类型 Protobuf 契约、流式传输支持好、Python 生态成熟。

**问题**：nodeAdmin 已有两套通信基础设施：

- Socket.IO + Redis Adapter（实时通信）
- Kafka Outbox 模式（异步事件）

**建议**：
| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| 同步决策请求（Agent 即时响应） | gRPC | 强类型、低延迟 |
| 异步事件驱动（消息到达、订单变更） | 复用 Kafka outbox | Agent 订阅 topic，不需要额外 gRPC 推送 |

**Proto 管理**：初期放 `packages/proto`（monorepo 内），等 Agent 数量 > 3 再拆独立仓库。

### 2. Agent 框架选型 — AutoGen 过早

**问题**：

- 闲鱼客服和量化日报是**完全独立的业务域**，不需要 Agent 间协作
- AutoGen 的多 Agent 编排在 1-2 个 Agent 的场景下是过度设计

**建议**：先用 LangChain/LangGraph 或直接调 API + prompt chain。等真正需要 Agent 间协作时再引入框架。

### 3. 向量数据库 — 暂不需要

**问题**：闲鱼客服话术库和商品 QA 预估在千条以内。

**建议**：使用 PostgreSQL 的 `pg_vector` 扩展即可。已有 PostgreSQL 基础设施，零额外运维成本。数据量过万或延迟要求极致时再考虑 Chroma/Milvus。

### 4. Docker 编排 — 已有，无需重建

nodeAdmin 的 `docker-compose.yml` 已有多 profile 编排（core、kafka、monitoring、tls、loadtest）。Python Agent 加个新 profile 即可。

"Docker Swarm 或 K8s" 对 1-2 个 Agent 容器过早。

### 5. 方案缺失的关键考虑

| 缺失项         | 说明                                      | 现有可复用资源                               |
| -------------- | ----------------------------------------- | -------------------------------------------- |
| Agent 故障隔离 | Python Agent 挂了不能影响中台             | `circuitBreaker.ts`、`degradationManager.ts` |
| 多租户隔离     | Agent 调用必须带 tenantId                 | gRPC metadata 传递租户上下文                 |
| LLM 成本控制   | 按 token 计费需中台层 rate limiting       | 现有 `httpRateLimiter.ts` 可扩展             |
| 可观测性       | Agent tracing 需与 OpenTelemetry 链路打通 | 现有 OTEL 基础设施                           |

---

## 修正后的推荐方案

| 方面       | Gemini 原方案    | 修正建议                        |
| ---------- | ---------------- | ------------------------------- |
| 通信       | 全 gRPC          | 同步用 gRPC，异步复用 Kafka     |
| Agent 框架 | AutoGen          | 先轻量实现，不用框架            |
| 向量数据库 | Chroma/Milvus    | pg_vector 扩展即可              |
| 编排       | Docker Swarm/K8s | 继续用 docker-compose + profile |
| Proto 管理 | 独立仓库         | 初期放 `packages/proto`         |

## 下一步

将此评审纳入决策日志（`docs/governance/decisionLog.md`），并在实际启动 Agent 开发时以修正方案为基准。
