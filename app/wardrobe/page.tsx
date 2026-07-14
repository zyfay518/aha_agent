import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { WardrobeManager, type ManagedItem } from "./wardrobe-manager";

export default async function WardrobePage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");
  const { data: items } = await supabase.from("wardrobe_items")
    .select("id,name,category,primary_color,sort_order")
    .is("deleted_at", null).order("category").order("sort_order").order("created_at", { ascending: false });
  const params = await searchParams;
  return <section className="wardrobe-page management-page">
    <div className="page-heading"><div><span className="eyebrow">WARDROBE</span><h1>我的衣橱</h1><p>分类浏览、调整顺序，点开单品即可修改或删除。</p></div><div className="heading-actions"><Link className="button primary" href="/wardrobe/new">添加单品</Link><form action={logout}><button className="text-button">退出登录</button></form></div></div>
    <nav className="wardrobe-tabs"><Link className="active" href="/wardrobe">衣橱</Link><Link href="/wardrobe/inspiration">穿搭灵感</Link><Link href="/wardrobe/settings">账号设置</Link></nav>
    {params.message && <div className="notice success wardrobe-notice">{params.message}</div>}
    {params.error && <div className="notice error wardrobe-notice">{params.error}</div>}
    {(items?.length ?? 0) === 0 ? <div className="empty-state"><h2>衣橱还是空的</h2><p>从一张清晰的单品图开始。</p><Link className="button primary" href="/wardrobe/new">添加第一件单品</Link></div> : <WardrobeManager items={(items ?? []) as ManagedItem[]} />}
  </section>;
}
