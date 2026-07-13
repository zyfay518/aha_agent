import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const wardrobeResourceUri = "ui://aha/wardrobe-v1.html";
const wardrobeWidget = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif}body{margin:0;padding:14px;background:transparent;color:CanvasText}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.head h2{margin:0;font:600 20px Georgia,serif}.count{color:#63735b;font-weight:700}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card{padding:12px;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:12px;background:color-mix(in srgb,Canvas 94%,#63735b 6%)}.card strong{display:block;margin-bottom:5px}.meta{font-size:13px;opacity:.68}.empty{padding:28px 12px;text-align:center;opacity:.65}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.summary .card{text-align:center}.summary b{display:block;font-size:22px}.summary span{font-size:12px;opacity:.68}@media(min-width:560px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style></head><body><div id="app" class="empty">正在读取衣橱…</div>
<script>
const labels={top:'上装',bottom:'下装',shoes:'鞋履',bag:'包袋'};
function render(data){const root=document.getElementById('app');if(!data){root.className='empty';root.textContent='还没有衣橱数据';return}
if(data.counts){root.className='';root.innerHTML='<div class="head"><h2>我的衣橱</h2><span class="count">'+data.total+' 件</span></div><div class="summary">'+Object.entries(data.counts).map(([k,v])=>'<div class="card"><b>'+v+'</b><span>'+labels[k]+'</span></div>').join('')+'</div>';return}
const items=data.items||[];root.className='';root.innerHTML='<div class="head"><h2>衣橱单品</h2><span class="count">'+items.length+' 件</span></div>'+(items.length?'<div class="grid">'+items.map(x=>'<div class="card"><strong>'+escapeHtml(x.name)+'</strong><div class="meta">'+(labels[x.category]||x.category)+' · '+escapeHtml(x.primary_color)+'</div></div>').join('')+'</div>':'<div class="empty">衣橱还是空的</div>')}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
render(window.openai&&window.openai.toolOutput);
addEventListener('message',e=>{const m=e.data;if(m&&m.method==='ui/notifications/tool-result')render(m.params&&m.params.structuredContent)});
</script></body></html>`;

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
    _meta: { ui: { resourceUri: wardrobeResourceUri }, "openai/outputTemplate": wardrobeResourceUri },
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
    _meta: { ui: { resourceUri: wardrobeResourceUri }, "openai/outputTemplate": wardrobeResourceUri },
  },
  {
    name: "attach_item_image",
    title: "保存衣橱单品原图",
    description: "Attach the user-uploaded image to an item immediately after add_wardrobe_item. Pass the temporary HTTPS download URL supplied by the ChatGPT host.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code", "item_id", "file_url"], properties: { access_code: { type: "string" }, item_id: { type: "string", format: "uuid" }, file_url: { type: "string", format: "uri" } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  },
  {
    name: "create_outfit_board",
    title: "生成图片穿搭板",
    description: "Create a visual outfit-board link from 1–5 exact wardrobe item IDs selected by the host agent.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code", "item_ids"], properties: { access_code: { type: "string" }, item_ids: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", format: "uuid" } }, title: { type: "string", maxLength: 40 } } },
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
  const accessCode=String(args.access_code??"");
  const origin=process.env.NEXT_PUBLIC_APP_URL||"https://aha-agent.vercel.app";
  if(name==="attach_item_image"){
    const url=new URL(String(args.file_url??""));
    if(url.protocol!=="https:")throw new Error("INVALID_IMAGE_URL");
    const response=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error("IMAGE_DOWNLOAD_FAILED");
    const mime=(response.headers.get("content-type")||"").split(";")[0];
    if(!["image/jpeg","image/png","image/webp"].includes(mime))throw new Error("UNSUPPORTED_IMAGE_TYPE");
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>8*1024*1024)throw new Error("IMAGE_TOO_LARGE");
    const {data,error}=await supabase.rpc("agent_put_item_image",{p_access_code:accessCode,p_item_id:args.item_id,p_mime_type:mime,p_base64:bytes.toString("base64")});
    if(error)throw new Error(error.message.includes("ITEM_NOT_FOUND")?"ITEM_NOT_FOUND":"IMAGE_SAVE_FAILED");
    return {saved:Boolean(data),item_id:args.item_id};
  }
  if(name==="create_outfit_board"){
    const ids=Array.isArray(args.item_ids)?args.item_ids.map(String):[];
    const {data,error}=await supabase.rpc("agent_list_wardrobe_items",{p_access_code:accessCode,p_category:null,p_limit:50});
    if(error)throw new Error(error.message.includes("INVALID_ACCESS_CODE")?"INVALID_ACCESS_CODE":"TOOL_EXECUTION_FAILED");
    const owned=new Set((data?.items??[]).map((item:{id:string})=>item.id));
    if(!ids.length||ids.some(id=>!owned.has(id)))throw new Error("ITEM_NOT_FOUND");
    const title=encodeURIComponent(String(args.title||"今日穿搭灵感"));
    return {outfit_url:`${origin}/outfit/${encodeURIComponent(accessCode)}?items=${ids.join(",")}&title=${title}`,item_ids:ids};
  }
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
  if(name==="get_wardrobe_summary")return {...data,wardrobe_url:`${origin}/closet/${encodeURIComponent(accessCode)}`};
  if(name==="list_wardrobe_items")return {...data,wardrobe_url:`${origin}/closet/${encodeURIComponent(accessCode)}`};
  return data;
}

export async function POST(request: Request) {
  let body: JsonRpcRequest;
  try { body = await request.json(); } catch { return jsonRpcError(null, -32700, "Parse error", 400); }

  if (body.method === "initialize") return jsonRpc(body.id, { protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "aha-wardrobe", version: "0.1.0" } });
  if (body.method === "notifications/initialized") return new Response(null, { status: 202, headers: corsHeaders });
  if (body.method === "ping") return jsonRpc(body.id, {});
  if (body.method === "tools/list") return jsonRpc(body.id, { tools });
  if (body.method === "resources/list") return jsonRpc(body.id, { resources: [{ uri: wardrobeResourceUri, name: "Aha wardrobe cards", title: "Aha 衣橱卡片", mimeType: "text/html;profile=mcp-app" }] });
  if (body.method === "resources/read") {
    const uri = (body.params as { uri?: string } | undefined)?.uri;
    if (uri !== wardrobeResourceUri) return jsonRpcError(body.id, -32002, "Resource not found");
    return jsonRpc(body.id, { contents: [{ uri: wardrobeResourceUri, mimeType: "text/html;profile=mcp-app", text: wardrobeWidget, _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } }, "openai/widgetDescription": "展示当前用户的衣橱概览或单品卡片。" } }] });
  }
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
