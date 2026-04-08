# Agent 微服务架构规划

> 来源：Gemini 生成，2026-04-06
> 评审意见：[agentMicroserviceReview.md](./agentMicroserviceReview.md)
>
> **Scope（2026-04-08 更新）**：nodeAdmin 是通用的中后台快速开发框架，Agent
> 能力（闲鱼客服、量化日报等）属于 **fork 出去的下游业务系统**，不是 nodeAdmin
> 本身的路线图工作。本文档与评审意见保留在这里，作为下游系统可能通过 nodeAdmin
> 的插件市场（见 `pluginMarketplacePlan.md`）集成时的架构参考。如果下游 fork 真正
> 启动 Agent 开发，应把对应的决策和实施计划放到 fork 的仓库，而不是这里。

## 1. 中台系统 (Node.js) 技术细节

中台作为核心枢纽，主要负责路由转发、鉴权、基础设施封装以及状态管理。

**框架建议**：推荐使用 NestJS。它的模块化和依赖注入设计非常适合构建复杂的企业级微服务中台，并且原生对 gRPC 有良好的支持。如果追求轻量，可以选择 Express 或 Koa，但需要自行组装微服务组件。

**核心模块划分**：

- **API 网关 (API Gateway)**：处理外部请求（如前端界面、外部 Webhook），进行统一的鉴权（JWT/OAuth）和限流。
- **基础设施抽象层**：将 RPA 脚本（如 Playwright/Puppeteer 实现的闲鱼模拟操作）、量化交易接口封装为内部标准的 API 或 gRPC 服务，供 Agent 调用。
- **调度与监控中心**：监控各 Agent 微服务的健康状态，并维护全局的定时任务（Cron Jobs）。

## 2. gRPC 通信与接口规范

gRPC 是 Node.js 中台与 Python Agent 之间的桥梁，通过 Protocol Buffers (Protobuf) 实现强类型约束。

**契约优先 (API First)**：建立一个独立的 Git 仓库专门管理 `.proto` 文件，Node.js 端和 Agent 端都依赖这个仓库生成各自的代码。

**接口设计示例**：

- `XianyuService`：包含 `ReceiveMessage`（中台推送新消息给 Agent）、`ExecuteAction`（Agent 下发发货指令给中台）。
- `QuantService`：包含 `FetchMarketData`（Agent 向中台请求数据）、`PushDailyReport`（Agent 推送生成的报告给中台分发）。

**通信模式**：

- **Unary (一元调用)**：适用于简单的请求-响应，例如 Agent 请求量化数据。
- **Server/Client Streaming (流式调用)**：适用于处理大量聊天记录或连续的实时行情数据。

## 3. Agent 端技术细节 (Python / 大模型生态)

Agent 部署在云端独立的容器中，负责决策与逻辑处理。

**Agent 框架开发**：可基于 LangChain 或 AutoGen 开发。AutoGen 更适合未来扩展多 Agent 团队（Agent Team）的协作场景。

### 闲鱼客服与发货 Agent

- **工作流**：中台轮询/监听闲鱼状态 → 通过 gRPC 将消息或订单事件推给 Agent → Agent 的 LLM 根据预设 Prompt 和知识库进行决策 → Agent 通过 gRPC 调用中台的"发货接口"或"回复接口"。
- **状态管理**：使用 Redis 维护会话上下文（Memory），确保多轮对话的连贯性。

### 量化分析与日报 Agent

- **数据处理**：利用 Pandas 和 NumPy 处理中台传递过来的结构化量化数据。
- **图表与报告**：使用 Matplotlib 或 Plotly 生成回测图表，结合 LLM 将枯燥的数据转化为具有分析视角的文字日报（Markdown/PDF 格式）。

## 4. 数据库与 Docker 容器化编排

数据库与各服务模块解耦，通过 Docker 实现弹性伸缩。

**存储选型建议**：

- **关系型数据库 (PostgreSQL/MySQL)**：存储结构化的高价值数据（用户配置、订单流水、量化交易记录）。
- **缓存与消息队列 (Redis)**：用于中台与 Agent 之间的异步任务队列、限流以及临时状态存储。
- **向量数据库 (Chroma/Milvus) (可选)**：如果闲鱼客服需要检索大量商品 QA 或话术库，可以引入向量数据库增强 Agent 的 RAG（检索增强生成）能力。

**Docker 编排**：

- 使用 `docker-compose.yml` 统一定义 Node.js 中台、Python Agent、数据库集群的网络和环境变量。
- 后续加节点时，可通过 Docker Swarm 或平滑迁移至 Kubernetes (K8s) 实现多节点负载均衡。
