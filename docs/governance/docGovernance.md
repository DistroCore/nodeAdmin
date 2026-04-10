# 文档治理规范

## 1. 目标

- 保证中台与 IM 项目文档可查、可追踪、可执行。
- 保证方案、决策、计划和执行闭环一致。

## 2. 目录与命名规则

- 目录名必须使用 `lowercase`（与仓库实践一致）。
- 文件名必须使用 `lowerCamelCase`。
- 文档只允许 `.md`。

### 2.1 目录分层

- `docs/governance/`：规范、流程、决策记录。
- `docs/architecture/`：架构、领域边界、技术基线。
- `docs/delivery/`：路线图、里程碑、脑暴与会议产物。
- `docs/operations/`：交付手册、日常维护、值守与变更流程。

### 2.2 文档命名示例

- `docGovernance.md`
- `architectureBaseline.md`
- `decisionLog.md`
- `roadmapPlan.md`

## 3. 文档状态

- `draft`：草稿，允许频繁修改。
- `review`：评审中，等待负责人确认。
- `approved`：已生效，作为执行基线。
- `archived`：归档，不再更新。

## 4. 变更规则

- 所有关键文档必须包含最近更新时间。
- 架构或决策变更必须同时更新 `decisionLog.md`。
- 涉及范围变更时，必须同步更新 `roadmapPlan.md`。

## 5. 责任分配

- 架构负责人：维护 `Architecture` 文档。
- 交付负责人：维护 `Delivery` 文档。
- 项目负责人：审批 `Governance` 和关键决策。

## 6. 评审节奏

- 每周一次文档巡检（内容完整性、状态一致性）。
- 每个里程碑结束后执行一次文档审计。

## 7. 最近更新时间

- 2026-04-10（修订目录命名规则，由 `UpperCamelCase` 改为 `lowercase`，与仓库实际结构对齐）
- 2026-02-28
