"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { analyzeWardrobeImage } from "@/lib/openai/analyze-wardrobe-image";
import { createClient } from "@/lib/supabase/server";
import {
  allowedImageTypes,
  isCategory,
  isColor,
  isSubcategory,
  maxImageBytes,
} from "@/lib/wardrobe/constants";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function extensionFor(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

export async function uploadAndAnalyze(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) fail("/wardrobe/new", "请选择一张单品照片");
  if (!allowedImageTypes.includes(image.type as (typeof allowedImageTypes)[number])) fail("/wardrobe/new", "仅支持 JPG、PNG 或 WebP 图片");
  if (image.size > maxImageBytes) fail("/wardrobe/new", "图片不能超过 4MB");

  const uploadId = randomUUID();
  const storagePath = `pending/${userId}/${uploadId}/original.${extensionFor(image.type)}`;
  const { error: storageError } = await supabase.storage.from("wardrobe-private").upload(storagePath, image, { contentType: image.type, upsert: false });
  if (storageError) fail("/wardrobe/new", "图片上传失败，请稍后重试");

  const { error: rowError } = await supabase.from("pending_uploads").insert({ id: uploadId, user_id: userId, storage_path: storagePath, status: "analyzing" });
  if (rowError) {
    await supabase.storage.from("wardrobe-private").remove([storagePath]);
    fail("/wardrobe/new", "无法建立分析任务，请稍后重试");
  }

  let warning: string | null = null;
  try {
    const analysis = await analyzeWardrobeImage(image);
    const status = analysis.is_wearable_item && analysis.item_count === 1 && analysis.candidate ? "review" : "rejected";
    await supabase.from("pending_uploads").update({ status, analysis }).eq("id", uploadId);
    if (status === "rejected") {
      warning = analysis.item_count === 2 ? "照片中似乎有多件单品，请一次只拍一件" : "没有识别到可收纳的衣物单品";
    }
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 180) : "ANALYSIS_FAILED";
    await supabase.from("pending_uploads").update({ status: "failed", error_code: code }).eq("id", uploadId);
    warning = "AI 识别暂时失败，你仍可以手动填写";
  }

  if (warning) redirect(`/wardrobe/new/review?upload=${uploadId}&warning=${encodeURIComponent(warning)}`);
  redirect(`/wardrobe/new/review?upload=${uploadId}`);
}

export async function confirmWardrobeItem(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const uploadId = String(formData.get("upload_id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const category = String(formData.get("category") ?? "");
  const subcategory = String(formData.get("subcategory") ?? "");
  const primaryColor = String(formData.get("primary_color") ?? "");
  if (!uploadId || !name || !isCategory(category) || !isSubcategory(category, subcategory) || !isColor(primaryColor)) fail(`/wardrobe/new/review?upload=${uploadId}`, "请检查名称、分类和颜色");

  const { data: existing } = await supabase.from("wardrobe_items").select("id").eq("source_upload_id", uploadId).maybeSingle();
  if (existing) redirect("/wardrobe");

  const { data: pending } = await supabase.from("pending_uploads").select("storage_path,analysis,status").eq("id", uploadId).single();
  if (!pending || pending.status === "confirmed") fail("/wardrobe/new", "这次上传已失效，请重新选择图片");

  const extension = pending.storage_path.split(".").pop() || "jpg";
  const itemId = randomUUID();
  const finalPath = `items/${userId}/${itemId}/original.${extension}`;
  const { error: moveError } = await supabase.storage.from("wardrobe-private").move(pending.storage_path, finalPath);
  if (moveError) fail(`/wardrobe/new/review?upload=${uploadId}`, "保存图片失败，请稍后重试");

  const candidate = pending.analysis && typeof pending.analysis === "object" && "candidate" in pending.analysis ? pending.analysis.candidate : null;
  const { error: insertError } = await supabase.from("wardrobe_items").insert({
    id: itemId,
    user_id: userId,
    source_upload_id: uploadId,
    name,
    category,
    subcategory,
    primary_color: primaryColor,
    secondary_color: candidate && typeof candidate === "object" && "secondary_color" in candidate ? candidate.secondary_color : null,
    season_tags: candidate && typeof candidate === "object" && "season_tags" in candidate ? candidate.season_tags : [],
    style_tags: candidate && typeof candidate === "object" && "style_tags" in candidate ? candidate.style_tags : [],
    original_image_path: finalPath,
    ai_metadata: pending.analysis,
  });
  if (insertError) {
    await supabase.storage.from("wardrobe-private").move(finalPath, pending.storage_path);
    fail(`/wardrobe/new/review?upload=${uploadId}`, "保存单品失败，请重试");
  }

  await supabase.from("pending_uploads").update({ status: "confirmed" }).eq("id", uploadId);
  revalidatePath("/wardrobe");
  redirect("/wardrobe?message=" + encodeURIComponent("单品已加入衣橱"));
}
