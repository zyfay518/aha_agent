"use client";

import { useState } from "react";
import { categories, categoryLabels, colorLabels, colors, subcategories, type WardrobeCategory } from "@/lib/wardrobe/constants";
import { confirmWardrobeItem } from "../actions";

type Candidate = {
  name?: string;
  category?: string;
  subcategory?: string;
  primary_color?: string;
  secondary_color?: string | null;
  season_tags?: string[];
};

const seasons = [
  ["spring", "春"], ["summer", "夏"], ["autumn", "秋"], ["winter", "冬"],
] as const;

const visibleColors = colors.filter((color) => color !== "unknown");

export function ReviewForm({ uploadId, candidate }: { uploadId: string; candidate: Candidate }) {
  const initialCategory = categories.includes(candidate.category as WardrobeCategory) ? candidate.category as WardrobeCategory : "top";
  const [category, setCategory] = useState<WardrobeCategory>(initialCategory);
  const initialSubcategory = subcategories[initialCategory].includes(candidate.subcategory ?? "") ? candidate.subcategory : "other";
  const initialColors = [candidate.primary_color, candidate.secondary_color]
    .filter((color): color is string => Boolean(color && color !== "unknown" && colors.includes(color as (typeof colors)[number])))
    .slice(0, 2);
  const [selectedColors, setSelectedColors] = useState(initialColors);
  const [saving, setSaving] = useState(false);

  function toggleColor(color: string) {
    setSelectedColors((current) => current.includes(color)
      ? current.filter((value) => value !== color)
      : current.length < 2 ? [...current, color] : [current[1], color]);
  }

  return (
    <form action={confirmWardrobeItem} onSubmit={() => setSaving(true)}>
      <input type="hidden" name="upload_id" value={uploadId} />
      <input type="hidden" name="subcategory" value={category === initialCategory ? initialSubcategory : "other"} />
      <label>名称<input name="name" defaultValue={candidate.name || "未命名单品"} maxLength={80} required /></label>
      <fieldset className="tag-fieldset">
        <legend>类别</legend>
        <div className="tag-options">
          {categories.map((value) => <label className={`choice-tag ${category === value ? "selected" : ""}`} key={value}>
            <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} />
            {categoryLabels[value]}
          </label>)}
        </div>
      </fieldset>
      <fieldset className="tag-fieldset">
        <legend>适合季节 <small>可多选</small></legend>
        <div className="tag-options">
          {seasons.map(([value, label]) => <label className="choice-tag" key={value}>
            <input type="checkbox" name="season_tags" value={value} defaultChecked={candidate.season_tags?.includes(value)} />
            {label}
          </label>)}
        </div>
      </fieldset>
      <fieldset className="tag-fieldset">
        <legend>颜色 <small>最多两个</small></legend>
        <div className="tag-options colors">
          {visibleColors.map((value) => <label className={`choice-tag ${selectedColors.includes(value) ? "selected" : ""}`} key={value}>
            <input type="checkbox" name="colors" value={value} checked={selectedColors.includes(value)} onChange={() => toggleColor(value)} />
            {colorLabels[value]}
          </label>)}
        </div>
      </fieldset>
      <button className="button primary" type="submit" disabled={saving}>{saving ? "正在保存…" : "确认加入衣橱"}</button>
    </form>
  );
}
