import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const groups = [{ title: "场合", values: ["通勤", "休闲", "约会", "运动", "旅行"] }, { title: "季节", values: ["春", "夏", "秋", "冬"] }, { title: "风格", values: ["简约", "休闲", "复古", "运动", "优雅"] }];
export default async function InspirationPage() {
  const supabase = await createClient(); const { data } = await supabase.auth.getClaims(); if (!data?.claims?.sub) redirect("/login");
  return <section className="wardrobe-page management-page"><div className="page-heading"><div><span className="eyebrow">INSPIRATION</span><h1>穿搭灵感</h1><p>以后保存喜欢的整套穿搭，并优先作为搭配参考。</p></div></div><nav className="wardrobe-tabs"><Link href="/wardrobe">衣橱</Link><Link className="active" href="/wardrobe/inspiration">穿搭灵感</Link><Link href="/wardrobe/settings">账号设置</Link></nav><div className="wardrobe-browser inspiration-browser"><aside className="category-sidebar"><button className="active">全部灵感</button>{groups.map((group) => <div className="inspiration-filter" key={group.title}><b>{group.title}</b>{group.values.map((value) => <span key={value}>{value}</span>)}</div>)}</aside><section className="wardrobe-results"><div className="result-heading"><div><h2>穿搭灵感库</h2><p>按照场合、季节和风格管理整套穿搭。</p></div></div><div className="empty-state compact"><h2>页面已预留</h2><p>图片上传、AI 识别和参考搭配将在下一阶段开放。</p></div></section></div></section>;
}
