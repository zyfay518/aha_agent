import { createClient } from "@supabase/supabase-js";
import { normalizeItemImage } from "@/lib/wardrobe/normalize-item-image";

export const runtime = "nodejs";

export async function GET(request: Request,{params}:{params:Promise<{itemId:string}>}){
 const {itemId}=await params; const viewId=new URL(request.url).searchParams.get("view");
 if(!viewId)return new Response("Unauthorized",{status:401});
 const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
 const {data,error}=await s.rpc("view_get_item_image",{p_view_id:viewId,p_item_id:itemId});
 if(error||!data||typeof data.base64!=="string"||typeof data.mime_type!=="string")return new Response("Not found",{status:404});
 return new Response(Buffer.from(data.base64,"base64"),{headers:{"Content-Type":data.mime_type,"Cache-Control":"private, max-age=300"}});
}

export async function POST(request:Request,{params}:{params:Promise<{itemId:string}>}){
 const {itemId}=await params;
 const code=request.headers.get("x-aha-access-code");
 if(!code)return Response.json({error:"UNAUTHORIZED"},{status:401});
 const form=await request.formData();
 const file=form.get("file");
 if(!(file instanceof File))return Response.json({error:"IMAGE_REQUIRED"},{status:400});
 try{
  const normalized=await normalizeItemImage(Buffer.from(await file.arrayBuffer()),file.type);
  const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  const {data,error}=await s.rpc("agent_put_item_image",{p_access_code:code,p_item_id:itemId,p_mime_type:normalized.mimeType,p_base64:normalized.bytes.toString("base64")});
  if(error)throw new Error(error.message.includes("ITEM_NOT_FOUND")?"ITEM_NOT_FOUND":"IMAGE_SAVE_FAILED");
  return Response.json({saved:Boolean(data),item_id:itemId});
 }catch(error){
  const message=error instanceof Error?error.message:"IMAGE_SAVE_FAILED";
  const status=message==="ITEM_NOT_FOUND"?404:message==="IMAGE_TOO_LARGE"?413:400;
  return Response.json({error:message},{status});
 }
}
