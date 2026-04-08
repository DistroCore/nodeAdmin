# react-intl @10.1.x x @types/react @18.3.x Peer Dependency Conflict

## 现状
`react-intl@10.1.x` 及其前序版本 (v8.0+) 已全面转向 `React 19` 及其对应 types。当前项目锁定在 `React@18.3.1`，导致 `npm install` 无法重建 lockfile。

## 路径对比

| 路径 | 优点 | 缺点 | 影响面 (adminPortal) |
| :--- | :--- | :--- | :--- |
| **(a) 升级 React 19** | 完美匹配最新 `react-intl`。 | 存在其他依赖不兼容风险。 | 需全面测试应用稳定性。 |
| **(b) 切换 FormatJS 直接使用** | 彻底摆脱 React 版本的 peer 限制。 | 极高重构成本：需替换 `useIntl`、`IntlProvider`。 | 涉及约 50+ 个业务面板及 UI 组件。 |
| **(c) 调整 @types/react 19** | 最快且侵入性最小的 "fix"。 | 可能存在 React 18 运行时与 19 类型不匹配。 | 仅需调整 `package.json`，业务逻辑零变动。 |

## 调研结论
`Path (c)` 是解决当前 CI 阻塞的最轻量方案，但 `Path (b)` 在长期跨 React 大版本升级时最具鲁棒性。建议优先评估业务对 React 19 升级的承受力以定夺。