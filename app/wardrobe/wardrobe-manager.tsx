"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { reorderWardrobeItems } from "./actions";
import { categoryLabels, colorLabels, type WardrobeCategory } from "@/lib/wardrobe/constants";

export type ManagedItem = { id: string; name: string; category: WardrobeCategory; primary_color: string; sort_order: number };

export function WardrobeManager({ items }: { items: ManagedItem[] }) {
  const [active, setActive] = useState<"all" | WardrobeCategory>("all");
  const [ordered, setOrdered] = useState(items);
  const [dragged, setDragged] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const categories: Array<"all" | WardrobeCategory> = ["all", "top", "bottom", "shoes", "bag"];
  const visible = useMemo(() => active === "all" ? ordered : ordered.filter((item) => item.category === active), [active, ordered]);

  function save(category: WardrobeCategory, next: ManagedItem[]) {
    const ids = next.filter((item) => item.category === category).map((item) => item.id);
    setStatus("正在保存顺序…");
    startTransition(async () => {
      const result = await reorderWardrobeItems(ids);
      setStatus(result?.error ?? "顺序已保存");
    });
  }

  function move(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const source = ordered.find((item) => item.id === sourceId);
    const target = ordered.find((item) => item.id === targetId);
    if (!source || !target || source.category !== target.category) return;
    const group = ordered.filter((item) => item.category === source.category);
    const from = group.findIndex((item) => item.id === sourceId);
    const to = group.findIndex((item) => item.id === targetId);
    const changed = [...group];
    const [removed] = changed.splice(from, 1);
    changed.splice(to, 0, removed);
    let index = 0;
    const next = ordered.map((item) => item.category === source.category ? changed[index++] : item);
    setOrdered(next);
    save(source.category, next);
  }

  function nudge(id: string, direction: -1 | 1) {
    const item = ordered.find((entry) => entry.id === id);
    if (!item) return;
    const group = ordered.filter((entry) => entry.category === item.category);
    const index = group.findIndex((entry) => entry.id === id);
    const target = group[index + direction];
    if (target) move(id, target.id);
  }

  return <div className="wardrobe-browser">
    <aside className="category-sidebar" aria-label="衣橱分类">
      {categories.map((category) => <button key={category} className={active === category ? "active" : ""} onClick={() => setActive(category)}>
        <span>{category === "all" ? "全部" : categoryLabels[category]}</span>
        <b>{category === "all" ? ordered.length : ordered.filter((item) => item.category === category).length}</b>
      </button>)}
      <Link href="/wardrobe/inspiration">穿搭灵感</Link>
    </aside>
    <section className="wardrobe-results">
      <div className="result-heading"><div><h2>{active === "all" ? "全部单品" : categoryLabels[active]}</h2><p>拖动图片可调整同一分类中的顺序</p></div><span aria-live="polite">{pending ? "正在保存…" : status}</span></div>
      <div className="managed-grid">
        {visible.map((item) => <article key={item.id} draggable onDragStart={() => setDragged(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) move(dragged, item.id); setDragged(null); }}>
          <Link href={`/wardrobe/${item.id}`} className="managed-card-link">
            <div className="managed-photo"><Image src={`/api/wardrobe-media/${item.id}`} alt={item.name} fill sizes="(max-width: 700px) 42vw, 210px" unoptimized /></div>
            <strong>{item.name}</strong><small>{categoryLabels[item.category]} · {colorLabels[item.primary_color] ?? item.primary_color}</small>
          </Link>
          <div className="order-buttons"><button onClick={() => nudge(item.id, -1)} aria-label={`将${item.name}前移`}>←</button><button onClick={() => nudge(item.id, 1)} aria-label={`将${item.name}后移`}>→</button><Link href={`/wardrobe/${item.id}`}>编辑</Link></div>
        </article>)}
      </div>
    </section>
  </div>;
}
