import sharp from "sharp";

export type OutfitBoardCategory = "top" | "bottom" | "shoes" | "bag";

type OutfitBoardItem = {
  name: string;
  category: OutfitBoardCategory;
  image: Buffer;
};

type Slot = { x: number; y: number; width: number; height: number };
type PlacedItem = { item: OutfitBoardItem; slot: Slot };

const canvasSize = 1200;
const backgrounds = ["#edf1ec", "#ebeef1", "#f1ece8", "#eeebf0", "#f0eee7"];

function chooseBackground(items: OutfitBoardItem[]) {
  const seed = items.map((item) => `${item.category}:${item.name}`).join("|");
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return backgrounds[hash % backgrounds.length];
}

function distribute(items: OutfitBoardItem[], area: Slot): PlacedItem[] {
  if (!items.length) return [];
  const gap = items.length > 2 ? 12 : 24;
  const width = (area.width - gap * (items.length - 1)) / items.length;
  return items.map((item, index) => ({
    item,
    slot: { x: Math.round(area.x + index * (width + gap)), y: area.y, width: Math.round(width), height: area.height },
  }));
}

function relationshipLayout(items: OutfitBoardItem[]): PlacedItem[] {
  const tops = items.filter((item) => item.category === "top");
  const bottoms = items.filter((item) => item.category === "bottom");
  const shoes = items.filter((item) => item.category === "shoes");
  const bags = items.filter((item) => item.category === "bag");
  const groups = [tops, bottoms, shoes].filter((group) => group.length);

  if (!groups.length) {
    const columns = Math.min(2, bags.length);
    const rows = Math.ceil(bags.length / columns);
    return bags.map((item, index) => ({
      item,
      slot: {
        x: 170 + (index % columns) * 450,
        y: 170 + Math.floor(index / columns) * (760 / rows),
        width: 410,
        height: Math.round(700 / rows),
      },
    }));
  }

  const hasTwoSides = bags.length > 1;
  const main = hasTwoSides ? { x: 245, width: 710 } : bags.length ? { x: 90, width: 790 } : { x: 90, width: 1020 };
  const areas: Slot[] = groups.length === 3
    ? [
        { x: main.x, y: 45, width: main.width, height: 350 },
        { x: main.x, y: 390, width: main.width, height: 485 },
        { x: main.x, y: 880, width: main.width, height: 265 },
      ]
    : groups.length === 2
      ? groups[1][0].category === "shoes"
        ? [
            { x: main.x, y: 90, width: main.width, height: 650 },
            { x: main.x, y: 815, width: main.width, height: 300 },
          ]
        : [
            { x: main.x, y: 70, width: main.width, height: 470 },
            { x: main.x, y: 570, width: main.width, height: 540 },
          ]
      : [{ x: main.x, y: 130, width: main.width, height: 920 }];

  const placed = groups.flatMap((group, index) => distribute(group, areas[index]));
  if (bags.length === 1) {
    placed.push({ item: bags[0], slot: { x: 905, y: 355, width: 250, height: 380 } });
  } else {
    bags.forEach((item, index) => {
      const leftSide = index % 2 === 0;
      placed.push({
        item,
        slot: {
          x: leftSide ? 25 : 970,
          y: 255 + Math.floor(index / 2) * 370,
          width: 205,
          height: 330,
        },
      });
    });
  }
  return placed;
}

async function removeConnectedWhiteBackground(image: Buffer) {
  const { data, info } = await sharp(image, { limitInputPixels: 40_000_000, sequentialRead: true })
    .rotate()
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;
  const isBackground = (pixel: number) => {
    const offset = pixel * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return red >= 238 && green >= 238 && blue >= 238 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 16;
  };
  const enqueue = (pixel: number) => {
    if (pixel < 0 || pixel >= pixels || visited[pixel] || !isBackground(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < info.width; x += 1) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < info.width) enqueue(pixel + 1);
    enqueue(pixel - info.width);
    enqueue(pixel + info.width);
  }
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (visited[pixel]) data[pixel * 4 + 3] = 0;
  }
  return sharp(data, { raw: info }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 });
}

async function prepareItem(item: OutfitBoardItem, slot: Slot) {
  const categoryScale: Record<OutfitBoardCategory, number> = { top: 0.92, bottom: 0.98, shoes: 0.9, bag: 0.88 };
  const scale = categoryScale[item.category];
  const maxWidth = Math.round(slot.width * scale);
  const maxHeight = Math.round(slot.height * (item.category === "shoes" ? 0.78 : scale));
  const image = await (await removeConnectedWhiteBackground(item.image))
    .resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    input: image.data,
    left: Math.round(slot.x + (slot.width - image.info.width) / 2),
    top: Math.round(slot.y + (slot.height - image.info.height) / 2),
  } satisfies sharp.OverlayOptions;
}

export async function buildOutfitBoard(items: OutfitBoardItem[]) {
  if (items.length < 1 || items.length > 5) throw new Error("OUTFIT_ITEM_COUNT_INVALID");
  const composites = await Promise.all(relationshipLayout(items).map(({ item, slot }) => prepareItem(item, slot)));
  return sharp({ create: { width: canvasSize, height: canvasSize, channels: 3, background: chooseBackground(items) } })
    .composite(composites)
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
