# 企业级中台 + IM 项目规范（Node）

## 1) 命名规范（强制）

- 目录名：`UpperCamelCase`
  - 示例：`Apps`、`AdminPortal`、`CoreApi`、`MessageDomain`
- 业务代码文件名：`lowerCamelCase`
  - 示例：`conversationService.ts`、`messageRepository.ts`、`adminDashboardPage.tsx`
- 特殊说明：工具/框架约定文件保留官方命名
  - 示例：`package.json`、`tsconfig.json`、`tailwind.config.ts`、`postcss.config.js`

## 2) 技术栈（更新后）

- 后端：`Node.js + NestJS`（企业组织结构更清晰）
- 前端：`React + TypeScript + Tailwind CSS + shadcn/ui`
- 实时通信：`Socket.IO`
- 缓存与在线状态：`Redis`
- 可靠异步：`Kafka`（或 `RabbitMQ`）
- 主数据存储：`PostgreSQL`

## 3) 推荐目录结构（符合命名规范）

```text
apps/
  AdminPortal/
    Src/
      App/
        appRoot.tsx
      Components/
        Ui/
          button.tsx
        Business/
          messagePanel.tsx
      Lib/
        className.ts
      Styles/
        globals.css
      main.tsx
  CoreApi/
    Src/
      Modules/
        Identity/
          identityController.ts
          identityService.ts
        Im/
          conversationService.ts
          messageService.ts
          presenceService.ts
      Infrastructure/
        redisClient.ts
        kafkaProducer.ts
      main.ts
packages/
  SharedTypes/
    Src/
      imEvents.ts
      authClaims.ts
docs/
  platformSpec.md
```

## 4) 前端（Tailwind + shadcn/ui）基线要求

### 4.1 Tailwind

- 必须启用 `tailwindcss` + `postcss` + `autoprefixer`
- 设计令牌放到 `tailwind.config.ts`（颜色、圆角、间距）
- 全局样式入口：`Src/Styles/globals.css`

### 4.2 shadcn/ui

- 组件放在：`Src/Components/Ui/`
- 业务封装组件放在：`Src/Components/Business/`
- `Ui` 层不写业务逻辑，只负责可复用视觉组件
- 业务层只组合 `Ui` 组件，不重复造基础控件

## 5) 落地约束（中台 + IM）

- 所有消息事件必须带：`tenantId`、`conversationId`、`messageId`、`traceId`
- 消费端必须幂等：基于 `eventId` 去重
- 只承诺“会话内有序”，不承诺全局有序
- 不允许双写：业务写库 + outbox 事务提交后再异步分发

## 6) 开发执行规则

- 新增目录时，只允许 `UpperCamelCase`
- 新增业务代码文件时，只允许 `lowerCamelCase`
- 前端新增页面/组件默认走 `Tailwind + shadcn/ui`
- PR 检查项新增：命名规范扫描 + UI 栈一致性检查
