import sharp from "sharp";

export type OutfitBoardCategory = "top" | "bottom" | "shoes" | "bag";

type OutfitBoardItem = {
  name: string;
  category: OutfitBoardCategory;
  image: Buffer;
};

type Slot = { x: number; y: number; width: number; height: number };

const canvasSize = 1200;
const categoryOrder: Record<OutfitBoardCategory, number> = { top: 0, bottom: 1, shoes: 2, bag: 3 };

const layouts: Record<number, Slot[]> = {
  1: [{ x: 170, y: 140, width: 860, height: 900 }],
  2: [
    { x: 75, y: 155, width: 500, height: 820 },
    { x: 625, y: 120, width: 500, height: 860 },
  ],
  3: [
    { x: 65, y: 70, width: 500, height: 570 },
    { x: 625, y: 55, width: 510, height: 665 },
    { x: 145, y: 735, width: 620, height: 375 },
  ],
  4: [
    { x: 60, y: 65, width: 500, height: 535 },
    { x: 625, y: 45, width: 515, height: 630 },
    { x: 65, y: 700, width: 610, height: 390 },
    { x: 720, y: 710, width: 390, height: 380 },
  ],
  5: [
    { x: 50, y: 55, width: 500, height: 585 },
    { x: 635, y: 40, width: 515, height: 570 },
    { x: 55, y: 735, width: 570, height: 360 },
    { x: 700, y: 615, width: 405, height: 320 },
    { x: 655, y: 940, width: 480, height: 210 },
  ],
};

const categoryScale: Record<OutfitBoardCategory, number> = {
  top: 0.9,
  bottom: 1,
  shoes: 0.82,
  bag: 0.78,
};

async function prepareItem(item: OutfitBoardItem, slot: Slot) {
  const scale = categoryScale[item.category];
  const maxWidth = Math.round(slot.width * scale);
  const maxHeight = Math.round(slot.height * (item.category === "shoes" ? 0.72 : scale));
  const trimmed = sharp(item.image, { limitInputPixels: 40_000_000 })
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 12 });
  const image = await trimmed
    .resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: false })
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });
  return {
    input: image.data,
    left: Math.round(slot.x + (slot.width - image.info.width) / 2),
    top: Math.round(slot.y + (slot.height - image.info.height) / 2),
  } satisfies sharp.OverlayOptions;
}

export async function buildOutfitBoard(items: OutfitBoardItem[]) {
  if (items.length < 1 || items.length > 5) throw new Error("OUTFIT_ITEM_COUNT_INVALID");
  const arranged = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => categoryOrder[a.item.category] - categoryOrder[b.item.category] || a.index - b.index)
    .map(({ item }) => item);
  const slots = layouts[arranged.length];
  const composites = await Promise.all(arranged.map((item, index) => prepareItem(item, slots[index])));

  return sharp({ create: { width: canvasSize, height: canvasSize, channels: 3, background: "#ffffff" } })
    .composite(composites)
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
