# 技术架构与代码库说明

> 文档性质：持续更新的系统设计与代码地图  
> 当前版本：0.1  
> 建立日期：2026-07-12  
> 状态：阶段 1 实施中；Supabase 与 Web 骨架已落地

## 1. 架构目标

1. 先支持 ChatGPT，但核心服务不能依赖单一 Agent 平台。
2. 用户数据必须严格隔离。
3. 图片识别结果必须经过服务端校验和用户确认。
4. 推荐逻辑必须在服务端落实“已有单品优先”。
5. 前端、MCP 和未来其他客户端共用同一套业务能力。
6. MVP 保持简单，同时为后续扩展分类、偏好、天气和其他平台留出边界。

## 2. 系统结构

```text
┌──────────────────────┐       ┌──────────────────────┐
│ ChatGPT App          │       │ 衣橱管理 Web         │
│ Apps SDK UI          │       │ Next.js              │
└──────────┬───────────┘       └──────────┬───────────┘
           │ MCP / HTTPS                   │ HTTPS
           └──────────────┬────────────────┘
                          ▼
                ┌───────────────────┐
                │ 应用服务层        │
                │ Auth / Wardrobe   │
                │ Vision / Outfit   │
                └───────┬───────────┘
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
┌────────────────┐ ┌───────────┐ ┌───────────────┐
│ PostgreSQL     │ │ 对象存储  │ │ OpenAI API    │
│ 用户与业务数据 │ │ 单品图片  │ │ 视觉与文本能力 │
└────────────────┘ └───────────┘ └───────────────┘
```

## 3. 初始技术选择

| 层级 | 初始选择 | 用途 |
|---|---|---|
| Web | Next.js、TypeScript | 用户网页、服务端接口和基础页面 |
| UI | Tailwind CSS | 移动端优先的界面实现 |
| 数据库 | PostgreSQL | 用户、单品、穿搭、授权和日志 |
| 托管基础能力 | Supabase | PostgreSQL、认证和对象存储 |
| AI | OpenAI API | 图片理解、需求解析和穿搭说明 |
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
- 视觉识别模型：`gpt-5.4-mini-2026-03-17`，可通过服务端 `OPENAI_VISION_MODEL` 调整。
- 单图限制：JPG、PNG、WebP，最大 4MB，以兼容 Vercel 请求体限制。
- OpenAI API Key 仅存在于本地与 Vercel 服务端环境变量，不进入浏览器或版本控制。

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

### 4.4 Vision

职责：

- 识别是否为适合录入的单件衣物图片。
- 返回名称、大类、二级分类和主色。
- 返回结构化结果和不确定性。
- 识别失败时提供可恢复错误。

AI 输出只能作为候选值，保存前需经过模式校验和用户确认。

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
上传临时图片
  → AI 识别
  → 返回候选字段
  → 用户确认
  → 建立正式单品记录
  → 图片移动或标记为正式资源
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
- `packages/ai` 的模型输出必须经过结构化校验。
- `packages/outfit-engine` 负责已有单品优先和衣橱缺口约束。
- 客户端不能直接提交可信的 `user_id` 或 `existing_items_only`。
- 数据库结构变更只能通过迁移完成。

## 10. 配置与密钥

预计需要的配置类别：

- 数据库地址与服务端凭证。
- 对象存储配置。
- OpenAI API 密钥。
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

## 13. 详细规格索引

- `docs/specs/UX_FLOWS.md`：页面、状态和用户流程。
- `docs/specs/DATA_MODEL.md`：数据库、RLS、存储和删除流程。
- `docs/specs/API_MCP_CONTRACT.md`：Web API 与 MCP 工具契约。
- `docs/specs/AI_CONTRACT.md`：模型任务和结构化输出约束。
- `docs/specs/ACCEPTANCE_CASES.md`：阶段 0 形成的验收测试基线。

实现代码若与详细规格不一致，应先记录差异和原因，再更新规格，不能让文档静默失效。
