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

const initialized = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "aha-regression", version: "1" } });
assert.equal(initialized.serverInfo.name, "aha-wardrobe");
const listed = await rpc("tools/list");
const names = listed.tools.map((entry) => entry.name);
for (const required of ["verify_access", "add_wardrobe_item", "attach_item_image", "list_wardrobe_items", "get_wardrobe_summary", "create_outfit_board", "check_purchase_gap"]) assert(names.includes(required), `missing ${required}`);
for (const forbidden of ["update_wardrobe_item", "delete_wardrobe_item"]) assert(!names.includes(forbidden), `${forbidden} must stay web-only`);
for (const entry of listed.tools) assert(entry.annotations && typeof entry.annotations.readOnlyHint === "boolean", `${entry.name} annotations missing`);

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
    const metadata = await sharp(Buffer.from(board.content[0].data, "base64")).metadata();
    assert.equal(metadata.width, 1200, "outfit board must be square");
    assert.equal(metadata.height, 1200, "outfit board must be square");
  }
}

console.log(`Aha MCP regression passed (${names.length} tools, live data: ${code ? "yes" : "no"}).`);
