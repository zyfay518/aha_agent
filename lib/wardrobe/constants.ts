export const categories = ["top", "bottom", "shoes", "bag"] as const;
export type WardrobeCategory = (typeof categories)[number];

export const categoryLabels: Record<WardrobeCategory, string> = {
  top: "上装",
  bottom: "下装",
  shoes: "鞋履",
  bag: "包袋",
};

export const subcategories: Record<WardrobeCategory, readonly string[]> = {
  top: ["tshirt", "shirt", "knitwear", "hoodie", "jacket", "other"],
  bottom: ["trousers", "shorts", "swimwear", "skirt", "other"],
  shoes: ["sneakers", "leather_shoes", "boots", "sandals", "other"],
  bag: ["handbag", "shoulder_bag", "backpack", "other"],
};

export const subcategoryLabels: Record<string, string> = {
  tshirt: "T 恤",
  shirt: "衬衫",
  knitwear: "针织衫",
  hoodie: "卫衣",
  jacket: "外套",
  trousers: "长裤",
  shorts: "短裤",
  swimwear: "泳裤",
  skirt: "半身裙",
  sneakers: "运动鞋",
  leather_shoes: "皮鞋",
  boots: "靴子",
  sandals: "凉鞋",
  handbag: "手提包",
  shoulder_bag: "单肩包",
  backpack: "双肩包",
  other: "其他",
};

export const colors = [
  "black", "white", "gray", "beige", "brown", "navy", "blue", "green",
  "red", "pink", "purple", "yellow", "orange", "metallic", "multicolor", "unknown",
] as const;

export const colorLabels: Record<string, string> = {
  black: "黑色", white: "白色", gray: "灰色", beige: "米色", brown: "棕色",
  navy: "藏青色", blue: "蓝色", green: "绿色", red: "红色", pink: "粉色",
  purple: "紫色", yellow: "黄色", orange: "橙色", metallic: "金属色",
  multicolor: "多色", unknown: "不确定",
};

export const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxImageBytes = 4 * 1024 * 1024;

export function isCategory(value: string): value is WardrobeCategory {
  return categories.includes(value as WardrobeCategory);
}

export function isSubcategory(category: WardrobeCategory, value: string) {
  return subcategories[category].includes(value);
}

export function isColor(value: string) {
  return colors.includes(value as (typeof colors)[number]);
}
