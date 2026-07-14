import { normalizeItemImage } from "@/lib/wardrobe/normalize-item-image";
import { buildOutfitBoard } from "@/lib/wardrobe/build-outfit-board";
import { getPublicSupabaseClient } from "@/lib/supabase/public-server";

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
    description: "Use this after the host agent has analyzed a user-provided image and the user has confirmed category, seasons, and colors. Saving is NOT complete until attach_item_image succeeds for the returned item ID. Never tell the user the item was saved before both calls succeed.",
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
    name: "get_wardrobe_summary",
    title: "获取衣橱概览",
    description: "Use this when the user asks to see or open the wardrobe. Return only wardrobe_url as a clickable link, with no inventory, explanation, or extra prose unless the user explicitly asks for a text summary. The URL is stable for this user.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code"], properties: { access_code: { type: "string" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { ui: { resourceUri: wardrobeResourceUri }, "openai/outputTemplate": wardrobeResourceUri },
  },
  {
    name: "attach_item_image",
    title: "保存白底服装主体图",
    description: "Mandatory immediately after add_wardrobe_item. Attach the host-agent-produced catalog image containing only the clothing subject on a pure white background. Use file_url in ChatGPT or image_base64 plus mime_type when the host only has a local edited file. If this fails, do not claim the item was saved; retry or roll back the incomplete record.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code", "item_id"], anyOf: [{ required: ["file_url"] }, { required: ["image_base64", "mime_type"] }], properties: { access_code: { type: "string" }, item_id: { type: "string", format: "uuid" }, file_url: { type: "string", format: "uri" }, image_base64: { type: "string", minLength: 16 }, mime_type: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  },
  {
    name: "create_outfit_board",
    title: "生成图片穿搭板",
    description: "Create and directly display a square 1200×1200 pure-white outfit-board image from 1–5 exact wardrobe item IDs selected by the host agent. The clean layout keeps garments visually dominant and shoes or bags proportionally smaller. Show the returned image in the conversation. Do not send outfit_url unless inline image rendering is unavailable.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code", "item_ids"], properties: { access_code: { type: "string" }, item_ids: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", format: "uuid" } }, title: { type: "string", maxLength: 40 } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "check_purchase_gap",
    title: "检查是否确实缺少单品",
    description: "Mandatory before suggesting any purchase. Returns may_suggest_purchase=false whenever the wardrobe already contains every required category. If false, do not recommend buying anything.",
    inputSchema: { type: "object", additionalProperties: false, required: ["access_code"], properties: { access_code: { type: "string" }, required_categories: { type: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: { type: "string", enum: ["top", "bottom", "shoes", "bag"] } } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
] as const;

async function getWardrobeViewId(supabase:ReturnType<typeof getPublicSupabaseClient>,accessCode:string){
  const {data,error}=await supabase.rpc("agent_get_or_create_wardrobe_view",{p_access_code:accessCode});
  if(error||typeof data!=="string")throw new Error(error?.message.includes("INVALID_ACCESS_CODE")?"INVALID_ACCESS_CODE":"VIEW_LINK_FAILED");
  return data;
}

function jsonRpc(id: JsonRpcRequest["id"], result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status, headers: corsHeaders });
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status, headers: corsHeaders });
}

async function callTool(name: string, args: Record<string, unknown>) {
  const supabase = getPublicSupabaseClient();
  const accessCode=String(args.access_code??"");
  const origin=process.env.NEXT_PUBLIC_APP_URL||"https://aha-agent.vercel.app";
  const {data:rate,error:rateError}=await supabase.rpc("agent_consume_rate_limit",{p_access_code:accessCode,p_tool_name:name});
  if(rateError)throw new Error(rateError.message.includes("INVALID_ACCESS_CODE")?"INVALID_ACCESS_CODE":"RATE_LIMIT_CHECK_FAILED");
  if(!(rate as {allowed?:boolean})?.allowed)throw new Error("RATE_LIMITED");
  if(name==="attach_item_image"){
    let bytes:Buffer;
    let mime:string;
    if(typeof args.file_url==="string"&&args.file_url){
      const url=new URL(args.file_url);
      if(url.protocol!=="https:")throw new Error("INVALID_IMAGE_URL");
      const response=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error("IMAGE_DOWNLOAD_FAILED");
      mime=(response.headers.get("content-type")||"").split(";")[0];
      bytes=Buffer.from(await response.arrayBuffer());
    }else{
      mime=String(args.mime_type??"");
      const encoded=String(args.image_base64??"");
      if(!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error("INVALID_IMAGE_BASE64");
      bytes=Buffer.from(encoded,"base64");
    }
    const normalized=await normalizeItemImage(bytes,mime);
    const {data,error}=await supabase.rpc("agent_put_item_image",{p_access_code:accessCode,p_item_id:args.item_id,p_mime_type:normalized.mimeType,p_base64:normalized.bytes.toString("base64")});
    if(error)throw new Error(error.message.includes("ITEM_NOT_FOUND")?"ITEM_NOT_FOUND":"IMAGE_SAVE_FAILED");
    return {saved:Boolean(data),item_id:args.item_id};
  }
  if(name==="create_outfit_board"){
    const ids=Array.isArray(args.item_ids)?args.item_ids.map(String):[];
    if(!ids.length||ids.length>5||new Set(ids).size!==ids.length)throw new Error("ITEM_NOT_FOUND");
    const {data,error}=await supabase.rpc("agent_get_outfit_source",{p_access_code:accessCode,p_item_ids:ids});
    if(error){
      const message=error.message;
      throw new Error(message.includes("INVALID_ACCESS_CODE")?"INVALID_ACCESS_CODE":message.includes("ITEM_NOT_FOUND")||message.includes("VALIDATION_ERROR")?"ITEM_NOT_FOUND":"TOOL_EXECUTION_FAILED");
    }
    type BoardSourceItem={id:string;name:string;category:"top"|"bottom"|"shoes"|"bag";mime_type:string;base64:string};
    const source=data as {view_id?:unknown;items?:unknown};
    const selected=Array.isArray(source?.items)?source.items as BoardSourceItem[]:[];
    if(typeof source?.view_id!=="string"||selected.length!==ids.length||selected.some(item=>typeof item.base64!=="string"))throw new Error("IMAGE_NOT_FOUND");
    const imageResults=selected.map(item=>({name:item.name,category:item.category,image:Buffer.from(item.base64,"base64")}));
    const viewId=source.view_id;
    const boardTitle=String(args.title||"今日穿搭灵感");
    const board=await buildOutfitBoard(imageResults);
    const title=encodeURIComponent(boardTitle);
    return {outfit_url:`${origin}/outfit/${viewId}?items=${ids.join(",")}&title=${title}`,item_ids:ids,item_names:selected.map(item=>item.name),image_base64:board.toString("base64"),image_mime_type:"image/jpeg"};
  }
  if(name==="check_purchase_gap"){
    const required=Array.isArray(args.required_categories)&&args.required_categories.length?args.required_categories.map(String):["top","bottom"];
    const {data,error}=await supabase.rpc("agent_get_wardrobe_summary",{p_access_code:accessCode});
    if(error)throw new Error(error.message.includes("INVALID_ACCESS_CODE")?"INVALID_ACCESS_CODE":"TOOL_EXECUTION_FAILED");
    const counts=(data as {counts?:Record<string,number>})?.counts??{};
    const missing=required.filter(category=>(counts[category]??0)<1);
    return {may_suggest_purchase:missing.length>0,missing_categories:missing.slice(0,1),reason:missing.length?"衣橱缺少完成这套搭配所需的类别；只可提示一个缺口，不提供商店或购买链接。":"现有衣橱已覆盖所需类别，应优先用已有单品搭配，不建议购买。"};
  }
  let operation: string;
  let params: Record<string, unknown>;

  switch (name) {
    case "verify_access": operation = "agent_verify_access"; params = { p_access_code: args.access_code }; break;
    case "add_wardrobe_item": operation = "agent_add_wardrobe_item"; params = { p_access_code: args.access_code, p_idempotency_key: args.idempotency_key, p_name: args.name, p_category: args.category, p_subcategory: args.subcategory, p_colors: args.colors, p_seasons: args.seasons }; break;
    case "list_wardrobe_items": operation = "agent_list_wardrobe_items"; params = { p_access_code: args.access_code, p_category: args.category ?? null, p_limit: args.limit ?? 50 }; break;
    case "get_wardrobe_summary": operation = "agent_get_wardrobe_summary"; params = { p_access_code: args.access_code }; break;
    default: throw new Error("TOOL_NOT_FOUND");
  }

  const { data, error } = await supabase.rpc(operation, params);
  if (error) throw new Error(error.message.includes("INVALID_ACCESS_CODE") ? "INVALID_ACCESS_CODE" : error.message.includes("ITEM_NOT_FOUND") ? "ITEM_NOT_FOUND" : "TOOL_EXECUTION_FAILED");
  if(name==="get_wardrobe_summary"||name==="list_wardrobe_items"){
    const viewId=await getWardrobeViewId(supabase,accessCode);
    return {...data,wardrobe_url:`${origin}/closet/${viewId}`,management_url:`${origin}/wardrobe`};
  }
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
    const requestId=crypto.randomUUID();
    const started=Date.now();
    try {
      const data = await callTool(name, body.params?.arguments ?? {});
      console.info(JSON.stringify({event:"mcp_tool_call",request_id:requestId,tool:name,outcome:"success",duration_ms:Date.now()-started}));
      if(name==="create_outfit_board"&&typeof (data as {image_base64?:unknown}).image_base64==="string"){
        const imageData=String((data as {image_base64:string}).image_base64);
        const mimeType=String((data as {image_mime_type?:string}).image_mime_type||"image/jpeg");
        const {image_base64:discardedBase64,image_mime_type:discardedMime,...structuredContent}=data as Record<string,unknown>;
        void discardedBase64; void discardedMime;
        return jsonRpc(body.id,{content:[{type:"image",data:imageData,mimeType}],structuredContent});
      }
      const text=name==="get_wardrobe_summary"&&typeof (data as {wardrobe_url?:unknown})?.wardrobe_url==="string"
        ? String((data as {wardrobe_url:string}).wardrobe_url)
        : "Aha 衣橱操作已完成。";
      return jsonRpc(body.id, { content: [{ type: "text", text }], structuredContent: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TOOL_EXECUTION_FAILED";
      console.warn(JSON.stringify({event:"mcp_tool_call",request_id:requestId,tool:name,outcome:"error",error_code:message,duration_ms:Date.now()-started}));
      return jsonRpc(body.id, { isError: true, content: [{ type: "text", text: message }] });
    }
  }
  return jsonRpcError(body.id, -32601, "Method not found");
}

export function OPTIONS() { return new Response(null, { status: 204, headers: corsHeaders }); }
export function GET() { return new Response("Aha Wardrobe MCP accepts POST requests.", { status: 405, headers: corsHeaders }); }
