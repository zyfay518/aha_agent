"use client";

import { useState } from "react";
import { colors, colorLabels } from "@/lib/wardrobe/constants";

export function ColorChoices({ initial }: { initial: string[] }) {
  const [selected, setSelected] = useState(initial);
  return <div className="tag-options colors">{colors.map((value) => {
    const checked = selected.includes(value);
    return <label className="choice-tag" key={value}><input type="checkbox" name="colors" value={value} checked={checked} disabled={!checked && selected.length >= 2} onChange={() => setSelected((current) => checked ? current.filter((entry) => entry !== value) : [...current, value].slice(0, 2))} />{colorLabels[value]}</label>;
  })}</div>;
}
