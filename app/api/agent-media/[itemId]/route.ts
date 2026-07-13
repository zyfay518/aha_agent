import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request,{params}:{params:Promise<{itemId:string}>}){
 const {itemId}=await params; const code=new URL(request.url).searchParams.get("code");
 if(!code)return new Response("Unauthorized",{status:401});
 const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
 const {data,error}=await s.rpc("agent_get_item_image",{p_access_code:code,p_item_id:itemId});
 if(error||!data||typeof data.base64!=="string"||typeof data.mime_type!=="string")return new Response("Not found",{status:404});
 return new Response(Buffer.from(data.base64,"base64"),{headers:{"Content-Type":data.mime_type,"Cache-Control":"private, max-age=300"}});
}
