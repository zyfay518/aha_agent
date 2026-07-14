import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, context: { params: Promise<{ itemId: string }> }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse("Unauthorized", { status: 401 });
  const { itemId } = await context.params;
  const { data } = await supabase.rpc("web_get_item_image", { p_item_id: itemId });
  if (data?.base64) {
    return new NextResponse(Buffer.from(data.base64, "base64"), { headers: { "content-type": data.mime_type ?? "image/jpeg", "cache-control": "private, max-age=300" } });
  }
  const { data: item } = await supabase.from("wardrobe_items").select("thumbnail_path,original_image_path").eq("id", itemId).is("deleted_at", null).maybeSingle();
  const path = item?.thumbnail_path || item?.original_image_path;
  if (!path || path.startsWith("agent://")) return new NextResponse("Not found", { status: 404 });
  const { data: file, error } = await supabase.storage.from("wardrobe-private").download(path);
  if (error || !file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(await file.arrayBuffer(), { headers: { "content-type": file.type || "image/jpeg", "cache-control": "private, max-age=300" } });
}
