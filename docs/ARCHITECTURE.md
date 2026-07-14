# 技术架构与代码库说明

> 文档性质：持续更新的系统设计与代码地图  
> 当前版本：0.2
> 建立日期：2026-07-12  
> 状态：阶段 1 实施中；Supabase 与 Web 骨架已落地

## 1. 架构目标

1. 先支持 ChatGPT，但核心服务不能依赖单一 Agent 平台。
2. 用户数据必须严格隔离。
3. 图片理解和穿搭推理由用户正在使用的 Agent 完成，不由 Aha 后端调用模型 API。
4. Skill 固化“已有单品优先”和保存前确认流程，服务端负责数据约束与幂等。
5. 前端、MCP 和未来其他客户端共用同一套业务能力。
6. MVP 保持简单，同时为后续扩展分类、偏好、天气和其他平台留出边界。

## 2. 系统结构

```text
┌──────────────────────┐       ┌──────────────────────┐
│ Host Agent + Skill   │       │ 可选衣橱 Web         │
│ 自有视觉与推理额度   │       │ Next.js              │
└──────────┬───────────┘       └──────────┬───────────┘
           │ MCP / HTTPS                   │ HTTPS
           └──────────────┬────────────────┘
                          ▼
                ┌───────────────────┐
                │ 应用服务层        │
                │ Access / Wardrobe │
                │ MCP / UI data     │
                └───────┬───────────┘
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
┌────────────────┐              ┌───────────┐
│ PostgreSQL     │              │ 对象存储  │
│ 用户与业务数据 │              │ 单品图片  │
└────────────────┘              └───────────┘
```

## 3. 初始技术选择

| 层级 | 初始选择 | 用途 |
|---|---|---|
| Web | Next.js、TypeScript | 用户网页、服务端接口和基础页面 |
| UI | Tailwind CSS | 移动端优先的界面实现 |
| 数据库 | PostgreSQL | 用户、单品、穿搭、授权和日志 |
| 托管基础能力 | Supabase | PostgreSQL、认证和对象存储 |
| AI | 用户自己的 Agent/ChatGPT | 图片理解、需求解析和穿搭说明 |
| Agent 协议 | MCP | 向 ChatGPT 暴露结构化工具 |
| ChatGPT UI | Apps SDK | 对话中的确认卡和穿搭卡片 |
| 测试 | Vitest、Playwright | 单元、接口和端到端测试 |

当前基础设施：

- Supabase 项目：`aha_agent`。
- Supabase project ref：`icgsgjbywmbizqkzduve`。
- 区域：`ap-southeast-1`。
- API URL：`https://icgsgjbywmbizqkzduve.supabase.co`。
- 私有 Storage bucket：`wardrobe-private`。
- Vercel 项目：`aha-agent`。
- 正式地址：`https://aha-agent.vercel.app`。
- GitHub 自动部署仓库：`zyfay518/aha_agent`。
- 单图限制：JPG、PNG、WebP；手机大图由浏览器自动缩放并转为 JPEG，服务端仍以 4MB 作为安全上限，以兼容 Vercel 请求体限制。
- Aha 后端不保存 OpenAI API Key，也不调用模型 API。
- 可移植 Skill：`skills/aha-wardrobe`；远程 MCP：`https://aha-agent.vercel.app/mcp`。

所有选择均须在实际实施时验证。发生替换时，在 `PROJECT_LOG.md` 增加架构决策记录。

## 4. 服务模块

### 4.1 Identity

职责：

- 注册、登录和退出。
- Web 会话。
- ChatGPT OAuth 授权。
- refresh token 与撤销。
- 当前用户身份解析。

约束：

- 邀请码不能作为数据访问凭证。
- 服务端不得信任客户端传入的 `user_id`。
- 所有衣橱查询从已验证身份中取得用户 ID。

### 4.2 Wardrobe

职责：

- 新增、查询、修改和删除单品。
- 分类筛选和衣橱摘要。
- 用户数据隔离。
- 软删除和最终清理。
- 为网页展示生成每用户稳定、可撤销的只读 `view_id`；公开 URL 不包含 Agent 操作访问码。

访问边界：

- `AHA-...` Agent 访问码：仅在 MCP 工具参数中使用，可新增、修改和删除，不得出现在 URL 或助手回复中。
- `view_id`：随机 UUID，只能通过专用只读 RPC 列出该用户衣橱及读取对应图片，不能调用任何写操作。
- 映射表位于非暴露的 `private.wardrobe_view_links`，表本身不向 `anon` 或 `authenticated` 开放。

### 4.3 Media

职责：

- 校验图片类型和大小。
- 生成存储路径。
- 原图和缩略图管理。
- 签名访问地址。
- 删除任务。

建议存储路径：

```text
wardrobe-items/{user_id}/{item_id}/original.ext
wardrobe-items/{user_id}/{item_id}/thumbnail.webp
outfits/{user_id}/{outfit_id}/collage.webp
```

存储桶默认私有，客户端通过短时签名地址访问。

### 4.4 Host-agent reasoning

Skill 指导宿主 Agent 直接查看用户在对话中提供的图片，形成候选字段并向用户确认。MCP 只接收确认后的结构化字段，仍在服务端执行白名单、所有权和幂等校验。

### 4.5 Outfit

职责：

- 解析用户穿搭需求。
- 查询候选单品。
- 生成和评分组合。
- 去除高度重复的结果。
- 生成简短说明。
- 判断是否存在真实衣橱缺口。

购买限制必须由确定性服务端规则执行，不能只依赖模型提示词。

### 4.6 MCP

第一版工具：

```text
add_item
list_items
get_item
update_item
delete_item
generate_outfits
get_wardrobe_summary
```

职责：

- 将 MCP 请求映射到应用服务。
- 解析授权身份。
- 校验输入。
- 为写操作提供明确语义。
- 返回适合 ChatGPT App UI 渲染的结构化结果。

MCP 层不直接访问数据库，避免重复业务规则。

## 5. 初始数据模型

### 5.1 `profiles`

| 字段 | 说明 |
|---|---|
| id | 与认证用户对应的 UUID |
| display_name | 显示名称，可选 |
| created_at | 创建时间 |
| updated_at | 更新时间 |
| deletion_requested_at | 账号删除请求时间，可选 |

### 5.2 `wardrobe_items`

| 字段 | 说明 |
|---|---|
| id | 单品 UUID |
| user_id | 所属用户 UUID |
| name | 用户确认的名称 |
| category | top、bottom、shoes、bag |
| subcategory | 二级分类 |
| primary_color | 主色标准值 |
| secondary_color | 辅色，可选 |
| season_tags | AI 生成的季节标签，可选 |
| style_tags | AI 生成的风格标签，可选 |
| original_image_path | 私有原图存储路径 |
| thumbnail_path | 缩略图路径 |
| ai_metadata | 原始结构化识别信息 |
| confirmed_at | 用户确认时间 |
| created_at | 创建时间 |
| updated_at | 更新时间 |
| deleted_at | 软删除时间，可选 |

所有业务查询默认排除 `deleted_at` 非空的记录。

### 5.3 `outfits`

| 字段 | 说明 |
|---|---|
| id | 穿搭 UUID |
| user_id | 所属用户 |
| request_text | 用户原始需求 |
| explanation | 简短搭配说明 |
| existing_items_only | 是否全部来自已有衣橱 |
| gap_reason | 衣橱缺口原因，可选 |
| collage_path | 拼图路径，可选 |
| created_at | 创建时间 |

### 5.4 `outfit_items`

记录穿搭与单品之间的多对多关系，并保存展示顺序和角色。

### 5.5 `invites`

| 字段 | 说明 |
|---|---|
| id | 邀请 UUID |
| code_hash | 邀请码哈希，不存明文 |
| expires_at | 过期时间 |
| max_uses | 最大使用次数 |
| used_count | 已使用次数 |
| created_at | 创建时间 |

### 5.6 `oauth_grants`

保存用户与 ChatGPT App 的授权关系。敏感令牌必须加密或交由认证服务安全管理，不以明文写入业务日志。

### 5.7 `audit_events`

记录重要操作的主体、动作、目标和时间，不记录原始令牌或不必要的图片内容。

## 6. 数据生命周期

### 新增单品

```text
用户在 Agent 对话中提供图片
  → 宿主 Agent 识别
  → 返回候选字段
  → 用户确认
  → MCP 建立正式单品记录
  → Apps SDK 内嵌卡片持久化原图（下一阶段）
```

未确认的临时图片需要自动过期清理。

### 删除单品

```text
用户确认删除
  → 设置 deleted_at
  → 正常查询立即不可见
  → 暂定保留 7 天
  → 清理任务删除图片和记录
```

### 删除账号

```text
用户请求删除
  → 账号立即停用
  → 撤销外部授权
  → 暂定 7 天恢复期
  → 删除业务数据和对象存储文件
```

具体期限在上线前根据隐私政策和基础设施能力再次确认。

## 7. 穿搭推荐边界

推荐流程：

```text
解析需求
  → 查询当前用户的可用单品
  → 检查必要类别
  → 生成候选组合
  → 确定性色彩与完整性评分
  → AI 补充语义判断和说明
  → 服务端验证所有 item_id
  → 返回 1–3 套差异化结果
```

服务端验证：

- 每个 `item_id` 属于当前用户。
- 单品未被删除。
- 组合不存在重复角色错误。
- `existing_items_only` 由服务端计算。
- 存在合格组合时不允许返回购买建议。
- 缺口建议不包含未经用户要求的具体商品链接。

## 8. 目标代码库结构

代码建立后，初始目标结构如下：

```text
aha_agent/
├── README.md
├── docs/
│   ├── PRODUCT.md
│   ├── PROJECT_LOG.md
│   └── ARCHITECTURE.md
├── apps/
│   ├── web/                    # 衣橱管理网页
│   └── mcp-server/             # 远程 MCP 入口
├── packages/
│   ├── domain/                 # 平台无关的实体和业务规则
│   ├── database/               # 数据访问、迁移和生成类型
│   ├── auth/                   # 身份与授权封装
│   ├── ai/                     # 图片理解和模型输出校验
│   ├── outfit-engine/          # 组合、评分和缺口规则
│   ├── media/                  # 图片路径、缩略图和删除
│   ├── shared/                 # 共享类型和通用工具
│   └── ui/                     # Web 与 App 可复用组件
├── supabase/
│   ├── migrations/             # 数据库迁移
│   └── seed.sql                # 非敏感开发样例数据
├── tests/
│   ├── fixtures/               # 测试图片和结构化样例
│   └── e2e/                    # 跨应用验收测试
└── scripts/                    # 开发、校验和清理脚本
```

目录只在实际需要时创建，避免提前产生无实现内容的空模块。

## 9. 分层规则

- `apps/web` 和 `apps/mcp-server` 负责协议与呈现，不保存核心业务规则。
- `packages/domain` 不依赖 Next.js、ChatGPT 或具体数据库客户端。
- `packages/database` 不决定产品规则，只负责可靠的数据读写。
- Skill 将宿主 Agent 的识别结果转换成固定结构，服务端再次执行字段白名单校验。
- `packages/outfit-engine` 负责已有单品优先和衣橱缺口约束。
- 客户端不能直接提交可信的 `user_id` 或 `existing_items_only`。
- 数据库结构变更只能通过迁移完成。

## 10. 配置与密钥

预计需要的配置类别：

- 数据库地址与服务端凭证。
- 对象存储配置。
- OAuth client ID、secret 和回调地址。
- 应用基础 URL。
- 日志和监控配置。

规则：

- 仓库只提交 `.env.example`，不提交真实 `.env`。
- 服务端密钥不得出现在浏览器 bundle。
- 日志不得记录完整访问令牌、refresh token 或用户原始密码。

## 11. 测试结构

- 单元测试：分类、颜色标准化、组合生成、评分和缺口规则。
- 集成测试：数据库权限、图片生命周期、AI 输出校验和 MCP 工具。
- 端到端测试：注册、录入、修改、删除、生成穿搭和撤销授权。
- 安全测试：跨用户读取、伪造用户 ID、过期邀请、重复提交和未授权写操作。
- 回归样例：使用固定图片和固定模型输出测试业务行为，避免测试完全依赖实时模型结果。

## 12. 文档同步规则

以下变化必须更新本文档：

- 新增或删除顶层目录。
- 更换数据库、存储、AI 或部署方式。
- 新增核心服务或 MCP 工具。
- 修改重要数据表或数据生命周期。
- 改变认证、授权或用户隔离机制。
- 将业务逻辑从一个模块移动到另一个模块。

所有重要变化还需在 `PROJECT_LOG.md` 追加对应决策或变更记录。

## 13. 当前生产性能与存储策略（2026-07-14）

### 已实施的兼容性优化

- 服务端匿名 Supabase 客户端使用进程内惰性单例，避免每个 MCP、只读衣橱和图片请求重复创建客户端；不会保存用户登录会话。
- `create_outfit_board` 通过 `agent_get_outfit_source` 一次取得已校验单品、白底图和稳定只读 `view_id`。原先需要“列表 + 每件图片 + view_id”的 `N + 2` 次 Supabase 请求，现在固定为 1 次。
- 穿搭板内各单品的 Sharp 缩放并行执行，同时保持输入顺序与最终版式不变。
- 登录后的备份衣橱页面使用 `createSignedUrls` 批量申请图片签名地址，由每件一次 Storage 请求降为整页一次。
- 为 `agent_access_tokens.user_id` 和 `agent_item_images.user_id` 补充外键覆盖索引；旧 RPC、旧索引与返回契约均保留。
- 输入图片增加 4000 万像素解码上限和顺序读取，避免超大压缩图占用过多运行内存；现有 8 MB 文件大小限制和 1200×1200 JPEG 输出不变。

### 当前图片存储现状

- Agent 使用的白底主体图当前存于 `public.agent_item_images.image_bytes`（`bytea`）；MCP RPC 以 Base64 JSON 传输。
- 备份网页上传的原图路径存于 `wardrobe_items`，文件位于私有 Storage bucket `wardrobe-private`。
- 生产盘点时 3 张白底图原始字节共约 379 KB，但 `agent_item_images` 表总占用约 3.28 MB；Base64 传输还会比二进制增加约三分之一体积。
- 本轮不迁移已上线图片，避免同时改写入、读取、回填和回滚路径而影响当前功能。用户增长前应迁移为：私有 Storage 保存规范化白底图，数据库只保存路径、尺寸、MIME、内容哈希与处理状态；MCP 按需读取对象或使用短期签名 URL。

### 待规模增长后实施

1. 白底图从数据库 `bytea` 迁移到私有 Storage，并提供双读、校验、回填和回滚期。
2. 为列表接口加入游标分页；当前 50 件上限适合 MVP，不适合作为长期大衣橱方案。
3. 增加请求耗时、RPC 错误率、图片处理峰值内存和 Storage/数据库占用监控。
4. OAuth/API 网关上线时，将当前匿名可执行且内部校验高熵访问码的 RPC 迁出公开数据 API 边界。

## 14. 详细规格索引

- `docs/specs/UX_FLOWS.md`：页面、状态和用户流程。
- `docs/specs/DATA_MODEL.md`：数据库、RLS、存储和删除流程。
- `docs/specs/API_MCP_CONTRACT.md`：Web API 与 MCP 工具契约。
- `docs/specs/AI_CONTRACT.md`：模型任务和结构化输出约束。
- `docs/specs/ACCEPTANCE_CASES.md`：阶段 0 形成的验收测试基线。

实现代码若与详细规格不一致，应先记录差异和原因，再更新规格，不能让文档静默失效。
