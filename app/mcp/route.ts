import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const tools = [
  {
    name: "verify_access",
    title: "验证 Aha 衣橱访问码",
    description: "Use this when starting an Aha wardrobe session to verify the user's access code. Never repeat the code in assistant text.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code"], properties: { access_code: { type: "string", minLength: 16 } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "add_wardrobe_item",
    title: "把已确认单品加入衣橱",
    description: "Use this after the host agent has analyzed a user-provided image and the user has confirmed category, seasons, and colors. The Aha server does not perform AI image recognition.",
    inputSchema: {
      type: "object", additionalProperties: false,
      required: ["access_code", "idempotency_key", "name", "category", "subcategory", "colors", "seasons"],
      properties: {
        access_code: { type: "string" }, idempotency_key: { type: "string", minLength: 8, maxLength: 100 }, name: { type: "string", minLength: 1, maxLength: 80 },
        category: { type: "string", enum: ["top", "bottom", "shoes", "bag"] }, subcategory: { type: "string", minLength: 1, maxLength: 50 },
        colors: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } }, seasons: { type: "array", maxItems: 4, items: { type: "string", enum: ["spring", "summer", "autumn", "winter", "all_season"] } },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "list_wardrobe_items",
    title: "查询衣橱单品",
    description: "Use this before answering what the user owns or composing outfits from existing wardrobe items.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code"], properties: { access_code: { type: "string" }, category: { type: ["string", "null"], enum: ["top", "bottom", "shoes", "bag", null] }, limit: { type: "integer", minimum: 1, maximum: 50, default: 50 } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "update_wardrobe_item",
    title: "修改衣橱单品",
    description: "Use this to update one exact wardrobe item after the user identifies the item and states the changes.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code", "item_id", "patch"], properties: { access_code: { type: "string" }, item_id: { type: "string", format: "uuid" }, patch: { type: "object", minProperties: 1, additionalProperties: false, properties: { name: { type: "string" }, category: { type: "string", enum: ["top", "bottom", "shoes", "bag"] }, subcategory: { type: "string" }, primary_color: { type: "string" }, secondary_color: { type: ["string", "null"] }, season_tags: { type: "array", items: { type: "string" } } } } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "delete_wardrobe_item",
    title: "删除衣橱单品",
    description: "Use this only after the user explicitly confirms deletion of one exact wardrobe item.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code", "item_id", "confirmed"], properties: { access_code: { type: "string" }, item_id: { type: "string", format: "uuid" }, confirmed: { type: "boolean", const: true } } },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "get_wardrobe_summary",
    title: "获取衣橱概览",
    description: "Use this when the user asks for wardrobe counts or wants to open the optional visual wardrobe.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code"], properties: { access_code: { type: "string" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
] as const;

function rpcClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
}

function jsonRpc(id: JsonRpcRequest["id"], result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status, headers: corsHeaders });
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status, headers: corsHeaders });
}

async function callTool(name: string, args: Record<string, unknown>) {
  const supabase = rpcClient();
  let operation: string;
  let params: Record<string, unknown>;

  switch (name) {
    case "verify_access": operation = "agent_verify_access"; params = { p_access_code: args.access_code }; break;
    case "add_wardrobe_item": operation = "agent_add_wardrobe_item"; params = { p_access_code: args.access_code, p_idempotency_key: args.idempotency_key, p_name: args.name, p_category: args.category, p_subcategory: args.subcategory, p_colors: args.colors, p_seasons: args.seasons }; break;
    case "list_wardrobe_items": operation = "agent_list_wardrobe_items"; params = { p_access_code: args.access_code, p_category: args.category ?? null, p_limit: args.limit ?? 50 }; break;
    case "update_wardrobe_item": operation = "agent_update_wardrobe_item"; params = { p_access_code: args.access_code, p_item_id: args.item_id, p_patch: args.patch }; break;
    case "delete_wardrobe_item":
      if (args.confirmed !== true) throw new Error("DELETE_CONFIRMATION_REQUIRED");
      operation = "agent_delete_wardrobe_item"; params = { p_access_code: args.access_code, p_item_id: args.item_id }; break;
    case "get_wardrobe_summary": operation = "agent_get_wardrobe_summary"; params = { p_access_code: args.access_code }; break;
    default: throw new Error("TOOL_NOT_FOUND");
  }

  const { data, error } = await supabase.rpc(operation, params);
  if (error) throw new Error(error.message.includes("INVALID_ACCESS_CODE") ? "INVALID_ACCESS_CODE" : error.message.includes("ITEM_NOT_FOUND") ? "ITEM_NOT_FOUND" : "TOOL_EXECUTION_FAILED");
  return data;
}

export async function POST(request: Request) {
  let body: JsonRpcRequest;
  try { body = await request.json(); } catch { return jsonRpcError(null, -32700, "Parse error", 400); }

  if (body.method === "initialize") return jsonRpc(body.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "aha-wardrobe", version: "0.1.0" } });
  if (body.method === "notifications/initialized") return new Response(null, { status: 202, headers: corsHeaders });
  if (body.method === "ping") return jsonRpc(body.id, {});
  if (body.method === "tools/list") return jsonRpc(body.id, { tools });
  if (body.method === "tools/call") {
    const name = body.params?.name;
    if (!name) return jsonRpcError(body.id, -32602, "Missing tool name");
    try {
      const data = await callTool(name, body.params?.arguments ?? {});
      return jsonRpc(body.id, { content: [{ type: "text", text: "Aha 衣橱操作已完成。" }], structuredContent: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TOOL_EXECUTION_FAILED";
      return jsonRpc(body.id, { isError: true, content: [{ type: "text", text: message }] });
    }
  }
  return jsonRpcError(body.id, -32601, "Method not found");
}

export function OPTIONS() { return new Response(null, { status: 204, headers: corsHeaders }); }
export function GET() { return new Response("Aha Wardrobe MCP accepts POST requests.", { status: 405, headers: corsHeaders }); }
