"use client";

import { useState } from "react";
import { categories, categoryLabels, colorLabels, colors, subcategories, subcategoryLabels, type WardrobeCategory } from "@/lib/wardrobe/constants";
import { confirmWardrobeItem } from "../actions";

type Candidate = { name?: string; category?: string; subcategory?: string; primary_color?: string };

export function ReviewForm({ uploadId, candidate }: { uploadId: string; candidate: Candidate }) {
  const initialCategory = categories.includes(candidate.category as WardrobeCategory) ? candidate.category as WardrobeCategory : "top";
  const [category, setCategory] = useState<WardrobeCategory>(initialCategory);
  const initialSubcategory = subcategories[initialCategory].includes(candidate.subcategory ?? "") ? candidate.subcategory : "other";

  return (
    <form action={confirmWardrobeItem}>
      <input type="hidden" name="upload_id" value={uploadId} />
      <label>名称<input name="name" defaultValue={candidate.name || "未命名单品"} maxLength={80} required /></label>
      <label>大类
        <select name="category" value={category} onChange={(event) => setCategory(event.target.value as WardrobeCategory)}>
          {categories.map((value) => <option value={value} key={value}>{categoryLabels[value]}</option>)}
        </select>
      </label>
      <label>二级分类
        <select name="subcategory" key={category} defaultValue={category === initialCategory ? initialSubcategory : "other"}>
          {subcategories[category].map((value) => <option value={value} key={value}>{subcategoryLabels[value]}</option>)}
        </select>
      </label>
      <label>主色
        <select name="primary_color" defaultValue={candidate.primary_color || "unknown"}>
          {colors.map((value) => <option value={value} key={value}>{colorLabels[value]}</option>)}
        </select>
      </label>
      <button className="button primary" type="submit">确认加入衣橱</button>
    </form>
  );
}
