# Web API 与 MCP 工具契约

> 版本：0.2
> 状态：Skill + 远程 MCP 原型已实现

## 1. 设计边界

- Web 与 ChatGPT App 调用同一业务服务层。
- Web API 和 MCP 只是不同传输适配器。
- Web 身份来自验证后的 session；Skill MVP 使用高熵访问码换取固定衣橱身份，服务端只保存哈希。
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

MVP 对外暴露七个业务工具。图片既可通过宿主临时 URL，也可通过 Base64 传递；业务契约不依赖单一传输方式。

### `verify_access`

用途：在一次 Agent 会话开始时验证 Aha 访问码。访问码不得出现在助手回复中。

输入：

```json
{ "access_code": "AHA-..." }
```

输出：

```json
{
  "ok": true
}
```

### `add_wardrobe_item`

用途：保存由宿主 Agent 识别、且已经过用户确认的结构化单品。Aha 服务不分析图片。

输入含访问码、幂等键、名称、分类、二级分类、最多两个颜色和季节。重复幂等键返回同一个单品，而不是创建副本。

新增记录只是保存事务的第一段。宿主必须紧接着调用 `attach_item_image` 保存“仅服装主体＋纯白背景”的目录图；两步都成功后才允许向用户宣告保存成功。图片绑定失败时不得遗留一个被宣称成功的空图记录。

### `attach_item_image`

输入访问码、刚创建的 `item_id`，并二选一提供：宿主临时 HTTPS 图片地址；或 Codex 本地编辑结果的 `image_base64` 与 `mime_type`。服务端校验图片格式和大小，并统一转为白底 JPEG 目录图后覆盖该单品的展示图片。

### `list_wardrobe_items`

输入：可选 `category`、`primary_color`、`cursor`、`limit`。`limit` 默认 20，最大 50。

输出只返回当前用户未删除单品和下一页游标；每件单品包含 `has_image`，新增流程必须校验新单品为 `true` 后才能宣告保存成功。

### 网页专属的修改、排序与删除

MCP 不暴露单品修改和删除工具，底层旧 RPC 也撤销匿名及登录角色的执行权。Agent 返回登录管理入口，由用户在网页中选择精确对象、点选标签、拖拽排序或二次确认删除。

### `get_wardrobe_summary`

输出：

```json
{
  "total": 28,
  "counts": { "top": 12, "bottom": 8, "shoes": 5, "bag": 3 },
  "recent_items": [],
  "wardrobe_url": "每个用户固定不变、仅含只读 view UUID 的专属入口"
}
```

当用户意图是“看衣橱”时，助手只输出 `wardrobe_url` 可点击链接；除非用户明确要求文字清单，否则不追加数量、单品列表或解释。

公开衣橱链接不得包含 `AHA-...` Agent 操作访问码。服务端为每个用户生成独立、稳定、可撤销的只读 `view_id`；该 ID 只能调用衣橱列表和图片读取函数，不能用于新增、修改、删除或图片写入。

### 穿搭生成

宿主 Agent 调用 `list_wardrobe_items` 获取已有单品后，用自身推理能力组合 1–3 套穿搭。服务端不调用 LLM。

### `create_outfit_board`

输入访问码、1–5 个属于当前用户的精确 `item_id`，以及可选标题。服务端读取这些单品已经保存的白底主体图，生成 1200×1200 的浅莫兰迪纯色背景商品拼贴 JPEG。服务端只把与目录图边缘连通的近白背景转为透明，避免彩色画布出现白色方框并尽量保护白色衣物。上装位于下装上方、鞋履位于下方、包袋置于两侧；不添加卡片边框、动态文字或其他页面装饰。

成功工具结果：

```json
{
  "content": [
    { "type": "image", "data": "<base64 JPEG>", "mimeType": "image/jpeg" }
  ],
  "structuredContent": {
    "item_ids": ["..."],
    "outfit_url": "仅供宿主无法渲染图片时降级使用的只读链接"
  }
}
```

Agent 必须优先把 `content` 中的图片直接显示在对话里。只有宿主明确无法渲染图片时才使用 `outfit_url`；正常回复不得只给“查看穿搭板”链接。

### `check_purchase_gap`

任何购买建议前必须调用。输入本套穿搭需要的类别，服务端根据未删除衣橱数据确定性返回 `may_suggest_purchase`。结果为 `false` 时禁止建议购物；结果为 `true` 时只允许描述第一个缺失类别，不提供店铺或商品链接。

## 5. 工具调用安全

- 查询工具可由模型按意图调用。
- 新增正式保存属于 MCP 写操作；修改、排序、删除和撤销授权属于登录网页写操作。
- 删除必须在网页详情页对明确对象二次确认。
- 工具结果中的签名图片 URL 短时有效，不进入模型长期文本或审计日志。
- MCP 工具元数据准确标明读写行为和副作用。

## 6. 版本策略

- MVP 内部 API 从 `/api` 开始，公开稳定后再引入 `/v1`。
- MCP 工具名称在内测后尽量保持稳定。
- 新增可选字段保持向后兼容。
- 删除或改变字段语义必须记录决策并提供迁移期。
