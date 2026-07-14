"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCategory, isColor, isSubcategory } from "@/lib/wardrobe/constants";

const seasons = ["spring", "summer", "autumn", "winter"];

function go(path: string, key: "message" | "error", value: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(value)}`);
}

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

export async function updateWardrobeItem(formData: FormData) {
  const { supabase, userId } = await session();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const category = String(formData.get("category") ?? "");
  let subcategory = String(formData.get("subcategory") ?? "other");
  const selectedColors = formData.getAll("colors").map(String).filter(isColor).slice(0, 2);
  const seasonTags = formData.getAll("season_tags").map(String).filter((value) => seasons.includes(value));
  if (!id || !name || !isCategory(category)) go(`/wardrobe/${id}`, "error", "请检查单品名称和类别");
  if (!isSubcategory(category, subcategory)) subcategory = "other";
  const { error } = await supabase.from("wardrobe_items").update({
    name,
    category,
    subcategory,
    primary_color: selectedColors[0] ?? "unknown",
    secondary_color: selectedColors[1] ?? null,
    season_tags: seasonTags,
  }).eq("id", id).eq("user_id", userId).is("deleted_at", null);
  if (error) go(`/wardrobe/${id}`, "error", "保存失败，请重试");
  revalidatePath("/wardrobe");
  revalidatePath(`/wardrobe/${id}`);
  go(`/wardrobe/${id}`, "message", "标签已更新");
}

export async function deleteWardrobeItem(formData: FormData) {
  const { supabase, userId } = await session();
  const id = String(formData.get("id") ?? "");
  if (formData.get("confirmation") !== "delete") go(`/wardrobe/${id}`, "error", "请先确认删除");
  const { error } = await supabase.from("wardrobe_items").update({ deleted_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId).is("deleted_at", null);
  if (error) go(`/wardrobe/${id}`, "error", "删除失败，请重试");
  revalidatePath("/wardrobe");
  go("/wardrobe", "message", "单品已从衣橱删除");
}

export async function reorderWardrobeItems(itemIds: string[]) {
  if (itemIds.length < 1 || itemIds.length > 200 || new Set(itemIds).size !== itemIds.length) return { error: "排序数据无效" };
  const { supabase } = await session();
  const { error } = await supabase.rpc("web_reorder_wardrobe_items", { p_item_ids: itemIds });
  if (error) return { error: "排序没有保存，请重试" };
  revalidatePath("/wardrobe");
  return { ok: true };
}

export async function revokeAgentAccess(formData: FormData) {
  const { supabase } = await session();
  if (formData.get("confirmation") !== "revoke") go("/wardrobe/settings", "error", "请先确认撤销授权");
  const { error } = await supabase.rpc("web_revoke_agent_access");
  if (error) go("/wardrobe/settings", "error", "撤销失败，请重试");
  revalidatePath("/wardrobe/settings");
  go("/wardrobe/settings", "message", "Agent 授权和只读衣橱链接已撤销");
}

export async function deleteAccount(formData: FormData) {
  const { supabase, userId } = await session();
  if (String(formData.get("confirmation") ?? "").trim() !== "删除我的账号") {
    go("/wardrobe/settings", "error", "请输入“删除我的账号”进行确认");
  }
  const [{ data: items }, { data: uploads }] = await Promise.all([
    supabase.from("wardrobe_items").select("original_image_path,thumbnail_path").eq("user_id", userId),
    supabase.from("pending_uploads").select("storage_path").eq("user_id", userId),
  ]);
  const paths = [...(items ?? []).flatMap((item) => [item.original_image_path, item.thumbnail_path]), ...(uploads ?? []).map((item) => item.storage_path)]
    .filter((path): path is string => Boolean(path) && !path.startsWith("agent://"));
  if (paths.length) {
    const { error } = await supabase.storage.from("wardrobe-private").remove([...new Set(paths)]);
    if (error) go("/wardrobe/settings", "error", "图片清理失败，账号尚未删除，请重试");
  }
  const { error } = await supabase.rpc("web_delete_account", { p_confirmation: "DELETE_MY_ACCOUNT" });
  if (error) go("/wardrobe/settings", "error", "账号删除失败，请联系客服处理");
  await supabase.auth.signOut({ scope: "global" });
  redirect("/?message=" + encodeURIComponent("账号及衣橱数据已删除"));
}
