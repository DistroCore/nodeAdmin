# 高并发超时配置优化分析报告

## 执行摘要

在5000并发负载测试中发现严重性能问题：
- **消息丢失率**: 85.6% (116,264条发送，仅16,718条接收)
- **超时错误**: 99,439次发送超时 + 95,997次消息超时
- **根本原因**: 多层超时配置不匹配，资源池过小

---

## 1. Socket.IO 配置问题

### 当前配置 (imGateway.ts:34-35)
```typescript
pingInterval: 30000,  // 30秒
pingTimeout: 25000,   // 25秒
```

### 问题分析
- **配置矛盾**: pingTimeout (25s) < pingInterval (30s) 导致客户端在下次ping前就超时
- **标准建议**: pingTimeout应为pingInterval的1.5-2倍
- **高并发影响**: 30秒间隔过长，无法及时检测死连接，导致资源泄漏

### 优化建议
```typescript
pingInterval: 25000,  // 25秒 (降低以更快检测断连)
pingTimeout: 60000,   // 60秒 (2.4倍pingInterval，容忍网络抖动)
```

---

## 2. Redis 连接配置问题

### 当前配置 (imGateway.ts:60-66)
```typescript
createClient({
  url: runtimeConfig.redis.url,
  // 缺少超时和连接池配置
})
```

### 问题分析
- **无超时保护**: 未设置socket超时、命令超时
- **无重连策略**: 网络故障时无法自动恢复
- **无连接池限制**: 可能耗尽Redis连接

### 优化建议
```typescript
createClient({
  url: runtimeConfig.redis.url,
  socket: {
    connectTimeout: 10000,      // 连接超时10秒
    keepAlive: 30000,           // 保活30秒
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Max retries reached');
      return Math.min(retries * 100, 3000); // 指数退避，最大3秒
    },
  },
  commandsQueueMaxLength: 1000, // 限制队列防止内存溢出
  pingInterval: 15000,          // 15秒ping检测连接健康
})
```

---

## 3. PgBouncer 配置问题

### 当前配置 (docker-compose.yml:32-34)
```yaml
MAX_CLIENT_CONN: 200      # 最大客户端连接
DEFAULT_POOL_SIZE: 20     # 默认连接池大小
POOL_MODE: transaction    # 事务模式
```

### 问题分析
- **连接池过小**: 20个后端连接无法支撑5000并发
- **缺少超时配置**: 未设置查询超时、空闲超时
- **无排队限制**: 客户端可能无限等待

### 优化建议
创建专用配置文件 `infra/docker/pgbouncer/pgbouncer.ini`:
```ini
[databases]
nodeadmin = host=postgres port=5432 dbname=nodeadmin

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
auth_type = plain
auth_file = /etc/pgbouncer/userlist.txt

# 连接池配置
pool_mode = transaction
max_client_conn = 5000           # 支持5000并发客户端
default_pool_size = 100          # 增加到100个后端连接
min_pool_size = 20               # 最小保持20个连接
reserve_pool_size = 20           # 预留20个应急连接
reserve_pool_timeout = 3         # 预留池等待3秒

# 超时配置
server_idle_timeout = 600        # 服务器空闲10分钟回收
server_lifetime = 3600           # 连接最大存活1小时
server_connect_timeout = 15      # 连接超时15秒
query_timeout = 30               # 查询超时30秒
query_wait_timeout = 120         # 排队等待最多2分钟
client_idle_timeout = 300        # 客户端空闲5分钟断开

# 性能优化
max_db_connections = 100         # 限制数据库总连接
max_user_connections = 100       # 限制单用户连接
```

---

## 4. Fastify 请求超时问题

### 当前配置 (main.ts:15-19)
```typescript
new FastifyAdapter({
  logger: {
    level: process.env.LOG_LEVEL?.trim() || 'info',
  },
})
// 缺少超时配置
```

### 问题分析
- **无请求超时**: 慢请求可能阻塞事件循环
- **无连接超时**: 慢客户端占用资源
- **无body大小限制**: 可能遭受DoS攻击

### 优化建议
```typescript
new FastifyAdapter({
  logger: {
    level: process.env.LOG_LEVEL?.trim() || 'info',
  },
  connectionTimeout: 60000,        // 连接超时60秒
  keepAliveTimeout: 65000,         // 保活超时65秒 (略大于connectionTimeout)
  requestTimeout: 30000,           // 请求处理超时30秒
  bodyLimit: 10485760,             // 10MB body限制
  maxParamLength: 500,             // URL参数最大500字符
})
```

---

## 5. PostgreSQL 连接池配置问题

### 当前配置 (imMessageRepository.ts:39-44)
```typescript
new Pool({
  connectionString: this.databaseUrl,
  max: 100,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})
```

### 问题分析
- **连接超时过短**: 5秒在高负载下容易超时
- **空闲超时过短**: 30秒导致频繁重连
- **缺少语句超时**: 慢查询可能阻塞连接池

### 优化建议
```typescript
new Pool({
  connectionString: this.databaseUrl,
  max: 100,                        // 保持100个连接
  min: 10,                         // 最小保持10个热连接
  idleTimeoutMillis: 300000,       // 空闲5分钟回收 (减少重连开销)
  connectionTimeoutMillis: 15000,  // 连接超时15秒 (容忍高负载)
  statement_timeout: 30000,        // 语句超时30秒
  query_timeout: 30000,            // 查询超时30秒
  allowExitOnIdle: false,          // 防止进程意外退出
})
```

---

## 6. 自适应超时策略建议

### 6.1 动态超时调整
```typescript
// apps/core-api/src/infrastructure/adaptive/adaptiveTimeoutManager.ts
export class AdaptiveTimeoutManager {
  private baseTimeout = 5000;
  private maxTimeout = 30000;
  private recentLatencies: number[] = [];

  recordLatency(latencyMs: number): void {
    this.recentLatencies.push(latencyMs);
    if (this.recentLatencies.length > 100) {
      this.recentLatencies.shift();
    }
  }

  getTimeout(): number {
    if (this.recentLatencies.length < 10) {
      return this.baseTimeout;
    }

    const p95 = this.calculatePercentile(95);
    const adaptive = Math.ceil(p95 * 2); // 2倍P95延迟
    return Math.min(Math.max(adaptive, this.baseTimeout), this.maxTimeout);
  }

  private calculatePercentile(percentile: number): number {
    const sorted = [...this.recentLatencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || this.baseTimeout;
  }
}
```

### 6.2 断路器模式
```typescript
// apps/core-api/src/infrastructure/adaptive/circuitBreaker.ts
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 5;
  private readonly resetTimeout = 60000; // 1分钟后尝试恢复

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
      }
      throw error;
    }
  }
}
```

### 6.3 背压控制
```typescript
// apps/core-api/src/infrastructure/adaptive/backpressureController.ts
export class BackpressureController {
  private activeRequests = 0;
  private readonly maxConcurrent = 1000;
  private readonly queueLimit = 5000;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      return;
    }

    if (this.queue.length >= this.queueLimit) {
      throw new Error('System overloaded - queue full');
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.activeRequests--;
    const next = this.queue.shift();
    if (next) {
      this.activeRequests++;
      next();
    }
  }
}
```

---

## 7. 环境变量配置建议

### 新增环境变量
```bash
# Socket.IO 超时配置
SOCKETIO_PING_INTERVAL=25000
SOCKETIO_PING_TIMEOUT=60000

# Redis 超时配置
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
REDIS_PING_INTERVAL=15000

# Fastify 超时配置
FASTIFY_CONNECTION_TIMEOUT=60000
FASTIFY_REQUEST_TIMEOUT=30000
FASTIFY_BODY_LIMIT=10485760

# PostgreSQL 超时配置
PG_CONNECTION_TIMEOUT=15000
PG_IDLE_TIMEOUT=300000
PG_STATEMENT_TIMEOUT=30000

# 自适应超时配置
ADAPTIVE_TIMEOUT_ENABLED=true
ADAPTIVE_TIMEOUT_BASE=5000
ADAPTIVE_TIMEOUT_MAX=30000

# 断路器配置
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT=60000

# 背压控制配置
BACKPRESSURE_MAX_CONCURRENT=1000
BACKPRESSURE_QUEUE_LIMIT=5000
```

---

## 8. 优先级实施计划

### P0 - 立即修复 (阻塞5k并发)
1. **修复Socket.IO超时矛盾**: pingTimeout > pingInterval
2. **扩容PgBouncer连接池**: 20 → 100
3. **增加PostgreSQL连接超时**: 5s → 15s

### P1 - 高优先级 (1-2天)
4. **添加Redis超时配置**: 连接超时、重连策略
5. **配置Fastify请求超时**: 防止慢请求阻塞
6. **优化PostgreSQL空闲超时**: 30s → 5min

### P2 - 中优先级 (1周)
7. **实现自适应超时管理器**: 根据P95延迟动态调整
8. **添加断路器保护**: 防止级联故障
9. **实现背压控制**: 过载时拒绝新请求

### P3 - 低优先级 (2周)
10. **添加超时监控指标**: Prometheus metrics
11. **配置超时告警**: AlertManager规则
12. **编写超时调优文档**: 运维手册

---

## 9. 验证计划

### 验证步骤
1. 应用P0修复后运行5k并发测试
2. 监控消息丢失率 (目标 < 1%)
3. 监控超时错误率 (目标 < 0.1%)
4. 检查P95延迟 (目标 < 500ms)
5. 验证资源使用率 (CPU < 80%, Memory < 80%)

### 成功标准
- ✅ 消息丢失率从85.6%降至 < 1%
- ✅ 超时错误从195k降至 < 500
- ✅ P95延迟 < 500ms
- ✅ 无连接池耗尽错误
- ✅ 系统稳定运行10分钟以上

---

## 10. 风险评估

### 高风险变更
- **PgBouncer连接池扩容**: 需验证PostgreSQL max_connections设置
- **超时时间延长**: 可能掩盖真实性能问题

### 缓解措施
- 分阶段部署，先在测试环境验证
- 保留回滚脚本
- 增加监控告警覆盖率
- 准备降级方案（限流、熔断）

---

**报告生成时间**: 2026-03-02
**负责人**: config-specialist
**审核状态**: 待team-lead审核
