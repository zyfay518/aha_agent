# 数据模型、权限与存储规格

> 版本：0.1  
> 状态：阶段 0 验收候选  
> 数据平台目标：PostgreSQL、Supabase Auth、Supabase Storage

## 1. 设计原则

- `auth.users.id` 是用户身份源。
- 所有公开 Schema 业务表启用 RLS。
- 所有用户数据表都含不可由客户端任意修改的 `user_id`。
- 客户端只使用 publishable key；service role 仅在受信服务端使用。
- 图片桶保持私有，使用短时签名 URL。
- 业务删除先软删除，再由后台任务彻底清理。
- 表名、字段和枚举使用英文，用户显示文字在应用层国际化。

## 2. 枚举

```sql
create type wardrobe_category as enum ('top', 'bottom', 'shoes', 'bag');
create type upload_status as enum ('pending', 'analyzing', 'review', 'confirmed', 'rejected', 'failed');
create type grant_status as enum ('active', 'revoked', 'expired');
```

二级分类第一版使用受校验的文本值，避免每次扩展都修改数据库枚举。

## 3. 表

### `profiles`

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK，引用 `auth.users(id)`，级联删除 |
| display_name | text | 可空，最长 80 |
| deletion_requested_at | timestamptz | 可空 |
| created_at | timestamptz | 非空，默认 now() |
| updated_at | timestamptz | 非空，默认 now() |

### `wardrobe_items`

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | 非空，引用 auth.users |
| name | text | 非空，1–80 字符 |
| category | wardrobe_category | 非空 |
| subcategory | text | 非空，受应用白名单校验 |
| primary_color | text | 非空，标准色代码 |
| secondary_color | text | 可空 |
| season_tags | text[] | 默认空数组 |
| style_tags | text[] | 默认空数组 |
| original_image_path | text | 非空，不存公开 URL |
| thumbnail_path | text | 可空 |
| ai_metadata | jsonb | 非空，默认 `{}` |
| confirmed_at | timestamptz | 非空 |
| deleted_at | timestamptz | 可空 |
| created_at | timestamptz | 非空 |
| updated_at | timestamptz | 非空 |

索引：

- `(user_id, created_at desc)`。
- `(user_id, category)` 且仅包含未删除记录。
- `(user_id, primary_color)` 且仅包含未删除记录。

### `pending_uploads`

保存尚未确认的临时上传。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK，也作为幂等键 |
| user_id | uuid | 所属用户 |
| storage_path | text | 私有临时图片路径 |
| status | upload_status | 当前状态 |
| analysis | jsonb | 已校验的 AI 候选结果 |
| error_code | text | 可恢复错误代码 |
| expires_at | timestamptz | 自动清理时间 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

确认成功后，`pending_uploads.id` 与正式单品建立唯一关联，防止重复提交。

### `outfits`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | 所属用户 |
| request_text | text | 原始需求，最长 1000 |
| explanation | text | 简短说明 |
| existing_items_only | boolean | 服务端计算 |
| gap | jsonb | 可空、经 Schema 校验 |
| collage_path | text | 可空 |
| created_at | timestamptz | 创建时间 |

### `outfit_items`

| 字段 | 类型 | 说明 |
|---|---|---|
| outfit_id | uuid | 组合主键之一 |
| item_id | uuid | 引用 wardrobe_items |
| role | text | top、bottom、shoes、bag |
| position | smallint | 展示顺序 |
| item_snapshot | jsonb | 历史显示快照 |

组合主键：`(outfit_id, item_id)`；同一套穿搭每个必要角色最多一个。

### `invites`

- 只保存随机码的哈希。
- 包含 `expires_at`、`max_uses`、`used_count` 和可选创建者。
- 消费邀请必须在数据库事务中原子检查并增加次数。

### `oauth_grants`

- 保存用户、外部主体标识、scope、状态和时间。
- refresh token 优先交由认证组件管理；必须自行保存时使用服务端密钥加密。
- 不向浏览器或普通数据库查询返回令牌密文。

### `audit_events`

记录重要写操作：新增、修改、删除、授权、撤销和账号删除请求。不得记录完整令牌或不必要的图片内容。

## 4. RLS 策略基线

每个用户业务表至少具有：

```sql
alter table public.wardrobe_items enable row level security;

create policy "select own wardrobe items"
on public.wardrobe_items for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert own wardrobe items"
on public.wardrobe_items for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "update own wardrobe items"
on public.wardrobe_items for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "delete own wardrobe items"
on public.wardrobe_items for delete
to authenticated
using ((select auth.uid()) = user_id);
```

实施时针对每张表单独评审，不能机械复制。需要注意：

- `TO authenticated` 本身不是对象级授权，必须同时检查所有权。
- UPDATE 同时需要 SELECT 策略、`USING` 和 `WITH CHECK`。
- 授权判断不使用用户可修改的 `user_metadata`。
- 视图使用 `security_invoker`，或放入不公开 Schema。
- 不使用 `SECURITY DEFINER` 绕过权限错误。

## 5. Storage

桶：

- `wardrobe-private`：原图、缩略图和临时图片。
- MVP 可先把拼图也放在该桶。

路径：

```text
pending/{user_id}/{upload_id}/original.ext
items/{user_id}/{item_id}/original.ext
items/{user_id}/{item_id}/thumbnail.webp
outfits/{user_id}/{outfit_id}/collage.webp
```

Storage 策略必须验证路径第一段或规定位置中的用户 ID 等于 `auth.uid()`。不允许用户任意覆盖其他路径。若使用 upsert，需要同时具备 INSERT、SELECT、UPDATE 权限；MVP 默认使用唯一文件名并避免 upsert。

## 6. 删除生命周期

- 临时上传：默认 24 小时未确认则清理。
- 删除单品：立即软删除，7 天后清理对象和业务记录。
- 删除账号：立即禁止正常使用并撤销授权，7 天后清理全部用户数据。
- 审计记录保留期限在隐私政策确定前不写死；不得保留已删除图片。
- 清理任务必须幂等，可安全重试。

## 7. 实施验收

- 匿名用户不能读取任何衣橱表或图片。
- A 用户不能读取、修改、删除或签名访问 B 用户数据。
- 伪造 `user_id` 的 INSERT 和 UPDATE 被拒绝。
- 删除后单品立即不出现在正常查询和推荐中。
- 数据库中不保存公开永久图片 URL。
- 数据库迁移和 RLS 测试进入版本控制。

