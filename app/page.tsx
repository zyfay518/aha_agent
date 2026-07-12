import Link from "next/link";

export default function Home() {
  return (
    <section className="hero">
      <div className="eyebrow">AI 线上衣橱</div>
      <h1>先穿好你已经拥有的。</h1>
      <p>整理现有衣物，用自己的单品生成简单协调的穿搭，在购买前先看看衣橱里是否已经有相似选择。</p>
      <div className="actions">
        <Link className="button primary" href="/signup">建立我的衣橱</Link>
        <Link className="button secondary" href="/login">我已有账号</Link>
      </div>
      <div className="principles">
        <article><strong>快速收纳</strong><span>一次上传一件单品，AI 帮你完成基础分类。</span></article>
        <article><strong>优先搭已有</strong><span>默认只从你的衣橱中选择，不随意鼓励购物。</span></article>
        <article><strong>简单可执行</strong><span>返回 1–3 套清楚的单品卡片组合。</span></article>
      </div>
    </section>
  );
}
