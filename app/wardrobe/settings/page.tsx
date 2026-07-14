import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount, revokeAgentAccess } from "../actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const supabase = await createClient(); const { data } = await supabase.auth.getClaims(); if (!data?.claims?.sub) redirect("/login"); const query = await searchParams;
  return <section className="wardrobe-page management-page"><div className="page-heading"><div><span className="eyebrow">PRIVACY</span><h1>账号设置</h1><p>管理 Agent 授权和你的全部衣橱数据。</p></div></div><nav className="wardrobe-tabs"><Link href="/wardrobe">衣橱</Link><Link href="/wardrobe/inspiration">穿搭灵感</Link><Link className="active" href="/wardrobe/settings">账号设置</Link></nav>{query.message && <div className="notice success wardrobe-notice">{query.message}</div>}{query.error && <div className="notice error wardrobe-notice">{query.error}</div>}<div className="settings-stack"><article><h2>撤销 Agent 授权</h2><p>现有访问码和只读衣橱链接会立即失效。网页账号和衣橱数据保留，之后可以重新授权。</p><form action={revokeAgentAccess}><label className="confirm-check"><input type="checkbox" name="confirmation" value="revoke" required />我确认撤销当前授权</label><button className="button secondary">撤销授权</button></form></article><article className="danger-zone permanent"><h2>删除账号和全部数据</h2><p>系统先删除所有原图和处理图，再永久清除衣橱、穿搭、授权和账号。此操作无法撤销。</p><form action={deleteAccount}><label>请输入“删除我的账号”<input name="confirmation" autoComplete="off" required /></label><button className="button danger">永久删除账号</button></form></article></div></section>;
}
