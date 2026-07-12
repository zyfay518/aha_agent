import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm } from "./review-form";

type Candidate = { name?: string; category?: string; subcategory?: string; primary_color?: string };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ upload?: string; error?: string; warning?: string }> }) {
  const params = await searchParams;
  if (!params.upload) redirect("/wardrobe/new");
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");
  const { data: pending } = await supabase.from("pending_uploads").select("storage_path,analysis,status").eq("id", params.upload).single();
  if (!pending) redirect("/wardrobe/new?error=" + encodeURIComponent("上传记录不存在或已失效"));
  const { data: signed } = await supabase.storage.from("wardrobe-private").createSignedUrl(pending.storage_path, 600);
  const candidate = (pending.analysis as { candidate?: Candidate } | null)?.candidate ?? {};
  const rejected = pending.status === "rejected";

  return (
    <section className="review-page">
      <Link className="back-link" href="/wardrobe/new">← 重新选择照片</Link>
      <div className="review-grid">
        <div className="review-image">{signed?.signedUrl ? <Image src={signed.signedUrl} alt="待确认单品" fill sizes="(max-width: 700px) 100vw, 45vw" style={{ objectFit: "contain" }} unoptimized /> : <span>图片暂时无法显示</span>}</div>
        <div className="review-form">
          <span className="eyebrow">确认识别结果</span>
          <h1>这件单品识别对吗？</h1>
          <p>AI 先帮你填写，保存前可以修改。</p>
          {params.warning && <div className="notice warning">{params.warning}</div>}
          {params.error && <div className="notice error">{params.error}</div>}
          {rejected ? <Link className="button primary" href="/wardrobe/new">重新上传单件照片</Link> : <ReviewForm uploadId={params.upload} candidate={candidate} />}
        </div>
      </div>
    </section>
  );
}
