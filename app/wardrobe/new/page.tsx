import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const { error } = await searchParams;

  return (
    <section className="upload-page">
      <Link className="back-link" href="/wardrobe">← 返回衣橱</Link>
      <div className="upload-card">
        <span className="eyebrow">添加单品</span>
        <h1>上传一件衣物</h1>
        <p>请使用平铺图或衣架图，一张照片里只放一件单品。</p>
        {error && <div className="notice error">{error}</div>}
        <UploadForm />
      </div>
    </section>
  );
}
