# Aha Agent — AI 线上衣橱

Aha Agent 是一个面向 ChatGPT 的个人线上衣橱工具，帮助“衣服很多但不知道怎么搭配、希望减少冲动消费”的用户整理已有单品，并优先使用现有衣物生成 1–3 套穿搭。

线上环境：https://aha-agent.vercel.app

项目当前处于产品定义与基础建设阶段。

## 本地运行

1. 安装 Node.js 20.9 或更高版本。
2. 复制 `.env.example` 为 `.env.local`，填写 Supabase 项目 URL 和 publishable key。
3. 安装并启动：

```bash
npm install
npm run dev
```

提交前运行：

```bash
npm run typecheck
npm run lint
npm run build
npm audit
```

## 工程文档

- [产品设计](docs/PRODUCT.md)：长期产品目标、目标用户、MVP 边界、用户流程与验收标准。
- [项目进展与决策日志](docs/PROJECT_LOG.md)：当前状态、实施计划、需求变更、验收反馈及关键决策。
- [技术架构与代码库说明](docs/ARCHITECTURE.md)：系统架构、数据存储、模块职责、代码目录及技术约束。
- [页面与用户流程](docs/specs/UX_FLOWS.md)：网页与 ChatGPT 中的完整用户路径、页面状态和交互规则。
- [数据模型](docs/specs/DATA_MODEL.md)：数据库表、枚举、约束、RLS 和数据生命周期。
- [API 与 MCP 契约](docs/specs/API_MCP_CONTRACT.md)：业务接口、MCP 工具输入输出和错误规范。
- [AI 输入输出契约](docs/specs/AI_CONTRACT.md)：图片识别与穿搭生成的结构化输出及校验规则。
- [阶段 0 验收案例](docs/specs/ACCEPTANCE_CASES.md)：开发前的功能、安全和业务规则测试基线。

## 文档维护规则

1. 新需求先判断是否符合 `PRODUCT.md` 中的产品目标，再进入开发。
2. 任何影响范围、交互、数据、接口或验收标准的调整，都追加到 `PROJECT_LOG.md`，不覆盖历史记录。
3. 代码结构、数据库、服务边界或部署方式发生变化时，同步更新 `ARCHITECTURE.md`。
4. 一个阶段只有在对应验收标准通过后，才能在项目日志中标记为完成。
