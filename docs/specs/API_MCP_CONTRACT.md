# Web API 与 MCP 工具契约

> 版本：0.1  
> 状态：阶段 0 验收候选

## 1. 设计边界

- Web 与 ChatGPT App 调用同一业务服务层。
- Web API 和 MCP 只是不同传输适配器。
- 身份来自验证后的 session/access token，不接受可信的请求体 `user_id`。
- 所有写接口支持幂等或明确的重复提交处理。
- MCP 返回结构化数据，UI 和模型不能自行编造业务记录。

## 2. 统一响应与错误

Web 成功响应：

```json
{ "data": {}, "request_id": "req_..." }
```

错误响应：

```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "未找到该单品",
    "retryable": false,
    "field_errors": {}
  },
  "request_id": "req_..."
}
```

核心错误码：`UNAUTHENTICATED`、`FORBIDDEN`、`VALIDATION_ERROR`、`UPLOAD_TOO_LARGE`、`UNSUPPORTED_IMAGE`、`MULTIPLE_ITEMS_DETECTED`、`ANALYSIS_FAILED`、`ITEM_NOT_FOUND`、`INSUFFICIENT_WARDROBE`、`RATE_LIMITED`、`INTERNAL_ERROR`。

## 3. Web API

| 方法与路径 | 用途 |
|---|---|
| `POST /api/uploads` | 创建临时上传并返回上传信息 |
| `POST /api/uploads/:id/analyze` | 分析临时图片 |
| `POST /api/uploads/:id/confirm` | 确认候选字段并创建单品 |
| `GET /api/wardrobe/items` | 分页和分类查询 |
| `GET /api/wardrobe/items/:id` | 查询单品详情 |
| `PATCH /api/wardrobe/items/:id` | 修改确认字段 |
| `DELETE /api/wardrobe/items/:id` | 软删除单品 |
| `GET /api/wardrobe/summary` | 分类数量摘要 |
| `POST /api/outfits/generate` | 生成 1–3 套穿搭 |
| `GET /api/outfits/:id` | 查询保存的穿搭 |
| `POST /api/account/delete-request` | 请求删除账号 |
| `POST /api/oauth/revoke` | 撤销 ChatGPT 授权 |

## 4. MCP 工具

MVP 对外暴露七个业务工具。上传图片的具体传递方式在 Apps SDK 原型验证后确定，业务契约不依赖某种临时 URL 实现。

### `prepare_wardrobe_item`

用途：分析图片并返回待确认候选，不直接正式保存。

输入：

```json
{
  "image": { "kind": "host_file_or_url", "value": "..." },
  "idempotency_key": "uuid"
}
```

输出：

```json
{
  "upload_id": "uuid",
  "status": "review",
  "candidate": {
    "name": "白色长袖衬衫",
    "category": "top",
    "subcategory": "shirt",
    "primary_color": "white"
  },
  "warnings": []
}
```

### `add_wardrobe_item`

用途：确认临时上传并正式保存。

输入必须含 `upload_id` 和用户确认后的四个字段。重复确认同一 `upload_id` 返回同一个单品，而不是创建副本。

### `list_wardrobe_items`

输入：可选 `category`、`primary_color`、`cursor`、`limit`。`limit` 默认 20，最大 50。

输出只返回当前用户未删除单品和下一页游标。

### `get_wardrobe_item`

通过单品 ID 取得详情。不存在和不属于当前用户都对外返回 `ITEM_NOT_FOUND`，避免枚举他人数据。

### `update_wardrobe_item`

仅允许修改 `name`、`category`、`subcategory`、`primary_color`。不允许修改 `user_id`、图片路径和 AI 原始审计字段。

### `delete_wardrobe_item`

输入包含 `item_id` 和 `confirmed: true`。工具描述必须明确这是写操作；若未确认则不执行。

### `get_wardrobe_summary`

输出：

```json
{
  "total": 28,
  "counts": { "top": 12, "bottom": 8, "shoes": 5, "bag": 3 },
  "recent_items": [],
  "wardrobe_url": "短时或用户专属入口"
}
```

### `generate_outfits`

输入：

```json
{ "request": "简单舒服的日常穿搭", "count": 3 }
```

约束：`count` 为 1–3；`request` 最长 1000 字符。

输出：

```json
{
  "request": "简单舒服的日常穿搭",
  "outfits": [
    {
      "id": "uuid",
      "items": [
        { "item_id": "uuid", "role": "top", "name": "白色衬衫", "image_url": "signed-url" }
      ],
      "explanation": "配色干净，适合轻松的日常穿着。",
      "existing_items_only": true
    }
  ],
  "gap": null
}
```

## 5. 工具调用安全

- 查询工具可由模型按意图调用。
- 新增正式保存、修改、删除和撤销授权属于写操作。
- 删除必须由用户对明确对象确认。
- 当自然语言名称对应多个单品时，先调用列表并让用户选择。
- 工具结果中的签名图片 URL 短时有效，不进入模型长期文本或审计日志。
- MCP 工具元数据准确标明读写行为和副作用。

## 6. 版本策略

- MVP 内部 API 从 `/api` 开始，公开稳定后再引入 `/v1`。
- MCP 工具名称在内测后尽量保持稳定。
- 新增可选字段保持向后兼容。
- 删除或改变字段语义必须记录决策并提供迁移期。

