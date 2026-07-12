import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

const labels = { top: "上装", bottom: "下装", shoes: "鞋履", bag: "包袋" } as const;

export default async function WardrobePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: items } = await supabase
    .from("wardrobe_items")
    .select("id,name,category,primary_color,thumbnail_path,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const counts = { top: 0, bottom: 0, shoes: 0, bag: 0 };
  for (const item of items ?? []) counts[item.category as keyof typeof counts] += 1;

  return (
    <section className="wardrobe-page">
      <div className="page-heading">
        <div><span className="eyebrow">个人空间</span><h1>我的衣橱</h1></div>
        <form action={logout}><button className="text-button">退出登录</button></form>
      </div>
      <div className="summary-grid">
        {(Object.keys(counts) as Array<keyof typeof counts>).map((key) => (
          <div className="summary-card" key={key}><strong>{counts[key]}</strong><span>{labels[key]}</span></div>
        ))}
      </div>
      {(items?.length ?? 0) === 0 ? (
        <div className="empty-state"><div className="empty-icon">＋</div><h2>衣橱还是空的</h2><p>下一阶段会在这里加入单品图片上传和 AI 自动分类。</p><button className="button primary" disabled>添加第一件单品</button></div>
      ) : (
        <div className="item-grid">{items?.map((item) => <article className="item-card" key={item.id}><div className="item-placeholder" /><strong>{item.name}</strong><span>{labels[item.category as keyof typeof labels]} · {item.primary_color}</span></article>)}</div>
      )}
    </section>
  );
}
