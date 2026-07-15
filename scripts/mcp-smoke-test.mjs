import assert from "node:assert/strict";
import sharp from "sharp";

const endpoint = process.env.AHA_MCP_URL || "http://localhost:3000/mcp";
let id = 0;
async function rpc(method, params) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  assert.equal(response.ok, true, `${method} returned HTTP ${response.status}`);
  const body = await response.json();
  assert.equal(body.error, undefined, `${method}: ${body.error?.message}`);
  return body.result;
}
async function tool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.notEqual(result.isError, true, `${name}: ${result.content?.[0]?.text}`);
  return result;
}
async function toolExpectError(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.equal(result.isError, true, `${name} should fail`);
  return result;
}

const initialized = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "aha-regression", version: "1" } });
assert.equal(initialized.serverInfo.name, "aha-wardrobe");
const listed = await rpc("tools/list");
const names = listed.tools.map((entry) => entry.name);
for (const required of ["verify_access", "add_wardrobe_item", "attach_item_image", "add_wardrobe_items_batch", "list_wardrobe_items", "get_wardrobe_summary", "create_outfit_board", "check_purchase_gap"]) assert(names.includes(required), `missing ${required}`);
for (const forbidden of ["update_wardrobe_item", "delete_wardrobe_item"]) assert(!names.includes(forbidden), `${forbidden} must stay web-only`);
for (const entry of listed.tools) assert(entry.annotations && typeof entry.annotations.readOnlyHint === "boolean", `${entry.name} annotations missing`);
const attachTool = listed.tools.find((entry) => entry.name === "attach_item_image");
assert.deepEqual(attachTool._meta?.["openai/fileParams"], ["file"], "attach_item_image must expose the ChatGPT file input");
const fileSchema = attachTool.inputSchema?.$defs?.OpenAIFile;
assert.deepEqual(fileSchema?.required, ["download_url", "file_id"], "ChatGPT file schema required fields are invalid");
for (const field of ["download_url", "file_id", "mime_type", "file_name"]) assert(fileSchema?.properties?.[field], `ChatGPT file schema missing ${field}`);
const batchTool = listed.tools.find((entry) => entry.name === "add_wardrobe_items_batch");
assert.deepEqual(batchTool._meta?.["openai/fileParams"], ["files"], "batch tool must expose the ChatGPT files array");
assert.equal(batchTool.inputSchema?.properties?.items?.minItems, 2);
assert.equal(batchTool.inputSchema?.properties?.items?.maxItems, 8);
assert.equal(batchTool.inputSchema?.properties?.files?.items?.$ref, "#/$defs/OpenAIFile");

const code = process.env.AHA_TEST_ACCESS_CODE;
if (code) {
  await tool("verify_access", { access_code: code });
  const wardrobe = await tool("list_wardrobe_items", { access_code: code, limit: 50 });
  const summary = await tool("get_wardrobe_summary", { access_code: code });
  assert.match(summary.structuredContent.wardrobe_url, /^https?:\/\/[^/]+\/closet\/[0-9a-f-]+$/i);
  assert.match(summary.structuredContent.management_url, /^https?:\/\/[^/]+\/wardrobe$/);
  assert(!summary.structuredContent.wardrobe_url.includes(code), "wardrobe URL leaked access code");
  const items = wardrobe.structuredContent.items || [];
  const present = new Set(items.map((item) => item.category));
  const required = ["top", "bottom"];
  const gap = await tool("check_purchase_gap", { access_code: code, required_categories: required });
  assert.equal(gap.structuredContent.may_suggest_purchase, required.some((category) => !present.has(category)));
  const withImages = items.filter((item) => item.has_image).slice(0, 2);
  if (withImages.length) {
    const board = await tool("create_outfit_board", { access_code: code, item_ids: withImages.map((item) => item.id), title: "自动回归" });
    assert.equal(board.content[0].type, "image");
    assert.equal(board.content[0].mimeType, "image/jpeg");
    assert(!JSON.stringify(board.content).includes("http"), "outfit response should render image inline");
    const boardBytes = Buffer.from(board.content[0].data, "base64");
    const metadata = await sharp(boardBytes).metadata();
    assert.equal(metadata.width, 1200, "outfit board must be square");
    assert.equal(metadata.height, 1200, "outfit board must be square");
    const corner = await sharp(boardBytes).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert(corner.some((channel) => channel < 248), "outfit board should use a light Morandi background rather than pure white");
  }
  if (process.env.AHA_TEST_BATCH === "1") {
    const stamp = Date.now();
    const key = `regression-batch-${stamp}`;
    const red = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#b84a4a" } }).jpeg().toBuffer();
    const blue = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#425f91" } }).jpeg().toBuffer();
    const image_payloads = [red, blue].map((bytes) => ({ image_base64: bytes.toString("base64"), mime_type: "image/jpeg" }));
    const validItems = [
      { name: `批量回归红上衣-${stamp}`, category: "top", subcategory: "T恤", colors: ["红色"], seasons: ["summer"] },
      { name: `批量回归蓝下装-${stamp}`, category: "bottom", subcategory: "短裤", colors: ["蓝色"], seasons: ["summer"] },
    ];
    const invalidItems = [validItems[0], { ...validItems[1], name: `不应写入-${stamp}`, category: "invalid" }];
    await toolExpectError("add_wardrobe_items_batch", { access_code: code, batch_idempotency_key: `invalid-${key}`, items: invalidItems, image_payloads });
    const afterInvalid = await tool("list_wardrobe_items", { access_code: code, limit: 50 });
    assert(!afterInvalid.structuredContent.items.some((item) => item.name.includes(stamp)), "failed batch must roll back every item");
    const created = await tool("add_wardrobe_items_batch", { access_code: code, batch_idempotency_key: key, items: validItems, image_payloads });
    assert.equal(created.structuredContent.created, true);
    assert.equal(created.structuredContent.count, 2);
    assert(created.structuredContent.items.every((item) => item.has_image), "batch items must all have images");
    const repeated = await tool("add_wardrobe_items_batch", { access_code: code, batch_idempotency_key: key, items: validItems, image_payloads });
    assert.equal(repeated.structuredContent.created, false);
    assert.deepEqual(repeated.structuredContent.items.map((item) => item.id), created.structuredContent.items.map((item) => item.id), "batch retry must reuse item IDs");
    console.log(`AHA_BATCH_TEST_IDS=${created.structuredContent.items.map((item) => item.id).join(",")}`);
  }
}

console.log(`Aha MCP regression passed (${names.length} tools, live data: ${code ? "yes" : "no"}).`);
