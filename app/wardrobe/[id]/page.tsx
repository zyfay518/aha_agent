import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { categories, categoryLabels, subcategories, subcategoryLabels } from "@/lib/wardrobe/constants";
import { deleteWardrobeItem, updateWardrobeItem } from "../actions";
import { ColorChoices } from "./color-choices";

const seasonLabels: Record<string, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { id } = await params;
  const { data: item } = await supabase.from("wardrobe_items").select("id,name,category,subcategory,primary_color,secondary_color,season_tags").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!item) notFound();
  const query = await searchParams;
  const selectedColors = [item.primary_color, item.secondary_color].filter(Boolean);
  return <section className="item-detail-page">
    <Link className="back-link" href="/wardrobe">← 返回衣橱</Link>
    <div className="detail-layout"><div className="detail-photo"><Image src={`/api/wardrobe-media/${item.id}`} alt={item.name} fill sizes="(max-width: 700px) 90vw, 420px" unoptimized /></div><div className="detail-editor">
      <span className="eyebrow">快速编辑</span><h1>{item.name}</h1><p>点选标签后保存即可，颜色最多选择两个。</p>
      {query.message && <div className="notice success">{query.message}</div>}{query.error && <div className="notice error">{query.error}</div>}
      <form action={updateWardrobeItem}><input type="hidden" name="id" value={item.id} /><label>单品名称<input name="name" defaultValue={item.name} maxLength={80} required /></label>
        <fieldset className="tag-fieldset"><legend>类别（单选）</legend><div className="tag-options">{categories.map((value) => <label className="choice-tag" key={value}><input type="radio" name="category" value={value} defaultChecked={item.category === value} />{categoryLabels[value]}</label>)}</div></fieldset>
        <fieldset className="tag-fieldset"><legend>细分类（单选）</legend><div className="tag-options">{Array.from(new Set(Object.values(subcategories).flat())).map((value) => <label className="choice-tag" key={value}><input type="radio" name="subcategory" value={value} defaultChecked={item.subcategory === value} />{subcategoryLabels[value]}</label>)}</div></fieldset>
        <fieldset className="tag-fieldset"><legend>季节（可多选）</legend><div className="tag-options">{Object.entries(seasonLabels).map(([value,label]) => <label className="choice-tag" key={value}><input type="checkbox" name="season_tags" value={value} defaultChecked={item.season_tags?.includes(value)} />{label}</label>)}</div></fieldset>
        <fieldset className="tag-fieldset"><legend>颜色（最多两个）</legend><ColorChoices initial={selectedColors as string[]} /></fieldset>
        <button className="button primary" type="submit">保存修改</button>
      </form>
      <details className="danger-zone"><summary>删除这件单品</summary><p>删除后会立即从衣橱和后续穿搭中移除。</p><form action={deleteWardrobeItem}><input type="hidden" name="id" value={item.id} /><label className="confirm-check"><input type="checkbox" name="confirmation" value="delete" required />我确认删除这件单品</label><button className="button danger" type="submit">确认删除</button></form></details>
    </div></div>
  </section>;
}
