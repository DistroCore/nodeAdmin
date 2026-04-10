# Harness 补强清单

## 1. 背景

- 评估日期：2026-04-10
- 对标对象：OpenAI 官方文章《Harness Engineering》
- 评估范围：`nodeAdmin` 当前的 `AGENTS.md`、`CLAUDE.md`、架构/治理/路线图文档、CI、验证脚本、监控与运维基线
- 当前判断：`nodeAdmin` 已具备较成熟的 `harness v1` 基础，但尚未达到“agent-first 工程操作系统”级别

## 2. 当前总体判断

- 优势：文档体系完整、CI 与集成验证较强、基础设施与可观测基线较完整、多 agent 协作边界已初步定义
- 主要缺口：真源不唯一、规则未充分机器化、agent 运行时能力不足、持续清理机制缺失
- 当前成熟度结论：`70 / 100`

## 3. 对标维度

- 上下文与知识组织：是否存在单一真源，agent 是否能按稳定顺序读取上下文
- 规则与约束执行：规范是否已编码为 lint、结构测试、CI gate，而不是只写在文档中
- 验证闭环：是否具备从静态检查到集成、验收、性能、运行时诊断的完整链路
- 可观测性：日志、指标、追踪是否可供 agent 直接消费，而不是仅供人工查看
- 多 agent 运行机制：是否存在工作隔离、审查流、并行执行和结果汇总机制
- 持续清理能力：是否有后台治理任务持续修复文档漂移、规则退化和 AI 残留

## 4. P0：真源收敛

- [x] 统一目录命名规范的真源，解决 `AGENTS.md`、`CLAUDE.md`、`platformSpec.md`、`decisionLog.md`、`docGovernance.md` 之间的冲突
- [x] 统一测试现状描述，删除"暂无测试"这类已过期信息，并与 `package.json`、GitHub CI 保持一致
- [x] 统一 tech debt 真源，确保 `README.md`、`roadmapPlan.md`、`decisionLog.md` 对同一债务项的状态描述一致
- [x] 在 `AGENTS.md` 中明确 agent 首读顺序，固定为项目级上下文入口，避免不同 agent 自行猜测
- [ ] 为关键治理文档补充状态字段（如 `draft` / `approved` / `archived`），避免 agent 误读草稿

## 5. P0：规则机器化

- [x] 在 ESLint 或独立脚本中恢复并强制执行 `no-explicit-any`，与项目规范保持一致
- [x] 增加 `no console.log` 规则，覆盖 TS、JS、CJS 文件
- [x] 增加命名规范扫描，校验目录名、业务文件名、测试文件名是否符合约定
- [x] 增加后端分层依赖检查，限制 `controller -> service -> repository` 的单向调用
- [ ] 增加架构约束检查，覆盖 IM 事件字段完整性、outbox 模式、防止双写等关键约束
- [x] 增加文档漂移检查，至少校验"最近更新时间""doc index 引用存在""核心文档之间的状态一致性"
- [x] 将以上检查全部接入 `npm run ci:local` 与 GitHub Actions，而不是仅保留在文档描述中

## 6. P0：验证闭环

- [ ] 修复 Playwright E2E 在 CI 中的 flaky 根因，并将 E2E gate 重新接回主流程
- [x] 将前端单元测试纳入 `ci:local` 默认路径，使其更贴近 GitHub CI 的真实行为
- [x] 为 integration / acceptance 失败输出标准诊断产物，包括 docker logs、迁移状态、关键端口和最近失败阶段摘要
- [x] 为高风险能力提供"一条命令复现"入口，覆盖 WebSocket 多节点、outbox + Kafka、RLS、PgBouncer 等场景
- [ ] 为 smoke / load / regression 输出固定格式结论，而不只是原始日志和 JSON 报告

## 7. P1：Agent Harness 化

- [ ] 扩展项目技能面，不再只保留 `dev`、`verify`、`verify-full`，补充 `investigate-runtime`、`review-diff`、`triage-flake`、`docs-sync`
- [x] 为 agent 定义统一任务模板，要求固定输出目标、边界、验证命令、风险和回滚方式
- [ ] 引入 `git worktree` 任务隔离模式，支持多 agent 并行而不污染同一工作目录
- [ ] 建立 agent review 流程，由实现 agent 之外的 review agent 执行结构检查与验证复跑
- [x] 增加后台治理任务，定期扫描文档漂移、未接线代码、重复实现、临时补丁和测试缺口
- [x] 生成项目级"当前状态卡"，概括当前阶段、开放 tech debt、阻塞项和下一步治理焦点

## 8. P1：可观测性 Agent 化

- [x] 为日志、指标、告警提供统一诊断脚本，让 agent 可直接读取最近故障上下文
- [ ] 将监控 runbook 提升为可执行查询入口，而不是仅描述"人如何操作"
- [x] 固化常见故障查询 playbook，覆盖连接暴涨、Kafka 积压、Redis 适配器异常、PgBouncer 池耗尽、消息投递延迟
- [ ] 为性能验证形成固定入口：`smoke -> load -> report -> conclusion`
- [ ] 让 agent 能自动生成运行时结论，而不是仅输出 Prometheus/Grafana 原始数据位置

## 9. P2：向 Agent-First 工程靠拢

- [ ] 为前端增加浏览器自动化验证入口，使 agent 能查看页面、抓取 DOM、截图和复现场景
- [ ] 为后端增加更严格的结构测试，如模块边界、禁止跨模块 repo 注入、插件注册约束
- [ ] 建立实现 agent、自审 agent、回归验证 agent、发布检查 agent 的固定分工流
- [x] 建立持续"代码垃圾回收"流程，清理 AI 残留、重复实现、过时文档和临时补丁
- [ ] 建立 repo 级质量评分卡，覆盖文档一致性、测试完整性、运行时可观测性、架构约束遵守度和 tech debt 热点

## 10. 建议执行顺序

1. 先完成 `P0：真源收敛`
2. 再完成 `P0：规则机器化`
3. 再补齐 `P0：验证闭环`
4. 然后推进 `P1：Agent Harness 化`
5. 最后进入 `P1：可观测性 Agent 化` 与 `P2：Agent-First` 能力建设

## 11. 阶段完成标准

### P0 完成标准

- 所有核心文档对同一事实的描述不再冲突
- 核心规范均存在可执行检查
- 本地与 CI 的验证链路基本一致
- E2E、integration、acceptance 的缺口均有明确处理结论

### P1 完成标准

- agent 拥有稳定的上下文入口、验证入口和诊断入口
- 多 agent 并行执行不再依赖人工协调工作目录
- review 与验证复跑形成固定流
- 常见运行时问题可由 agent 独立完成初步诊断

### P2 完成标准

- 项目具备持续清理和结构性回收能力
- 运行时与浏览器能力均可被 agent 直接消费
- 工程流程从“人驱动 + agent 辅助”升级为“agent 驱动 + 人验收”

## 12. 最近更新时间

- 2026-04-10（P0 真源收敛完成、P0 规则机器化大部分完成、P0 验证闭环部分完成、P1 Agent Harness 和可观测性部分完成、P2 代码垃圾回收完成）
