import {
  categories,
  colors,
  isCategory,
  isColor,
  isSubcategory,
  subcategories,
  type WardrobeCategory,
} from "@/lib/wardrobe/constants";

export type WardrobeImageAnalysis = {
  is_wearable_item: boolean;
  item_count: 0 | 1 | 2;
  candidate: null | {
    name: string;
    category: WardrobeCategory;
    subcategory: string;
    primary_color: string;
    secondary_color: string | null;
    season_tags: string[];
    style_tags: string[];
  };
  confidence: {
    category: number;
    subcategory: number;
    primary_color: number;
  };
  warnings: string[];
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["is_wearable_item", "item_count", "candidate", "confidence", "warnings"],
  properties: {
    is_wearable_item: { type: "boolean" },
    item_count: { type: "integer", enum: [0, 1, 2] },
    candidate: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["name", "category", "subcategory", "primary_color", "secondary_color", "season_tags", "style_tags"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            category: { type: "string", enum: categories },
            subcategory: { type: "string", enum: Array.from(new Set(Object.values(subcategories).flat())) },
            primary_color: { type: "string", enum: colors },
            secondary_color: { anyOf: [{ type: "null" }, { type: "string", enum: colors }] },
            season_tags: { type: "array", maxItems: 4, items: { type: "string", enum: ["spring", "summer", "autumn", "winter", "all_season"] } },
            style_tags: { type: "array", maxItems: 5, items: { type: "string", enum: ["basic", "casual", "smart_casual", "sporty", "formal", "minimal", "other"] } },
          },
        },
      ],
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["category", "subcategory", "primary_color"],
      properties: {
        category: { type: "number", minimum: 0, maximum: 1 },
        subcategory: { type: "number", minimum: 0, maximum: 1 },
        primary_color: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    warnings: { type: "array", maxItems: 5, items: { type: "string", maxLength: 120 } },
  },
} as const;

function extractOutputText(response: unknown) {
  if (!response || typeof response !== "object" || !("output" in response) || !Array.isArray(response.output)) return null;
  for (const item of response.output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && typeof content === "object" && "type" in content && content.type === "output_text" && "text" in content && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function validateAnalysis(value: unknown): WardrobeImageAnalysis {
  if (!value || typeof value !== "object") throw new Error("INVALID_AI_OUTPUT");
  const result = value as WardrobeImageAnalysis;
  if (![0, 1, 2].includes(result.item_count) || typeof result.is_wearable_item !== "boolean" || !Array.isArray(result.warnings)) throw new Error("INVALID_AI_OUTPUT");
  if (result.candidate) {
    if (!isCategory(result.candidate.category) || !isSubcategory(result.candidate.category, result.candidate.subcategory) || !isColor(result.candidate.primary_color)) throw new Error("INVALID_AI_OUTPUT");
    result.candidate.name = result.candidate.name.trim().slice(0, 80);
    if (!result.candidate.name) throw new Error("INVALID_AI_OUTPUT");
  }
  return result;
}

export async function analyzeWardrobeImage(file: File): Promise<WardrobeImageAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini-2026-03-17",
      reasoning: { effort: "none" },
      max_output_tokens: 1000,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "识别照片中的穿搭单品。一次只允许一个主体单品。不要猜测品牌；不确定时使用 other 或 unknown。item_count=2 表示多件或无法可靠分离。名称使用简洁中文。" },
          { type: "input_image", image_url: `data:${file.type};base64,${base64}`, detail: "low" },
        ],
      }],
      text: { format: { type: "json_schema", name: "wardrobe_item_analysis", strict: true, schema } },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`OPENAI_${response.status}${requestId ? `_${requestId}` : ""}`);
  }

  const text = extractOutputText(await response.json());
  if (!text) throw new Error("EMPTY_AI_OUTPUT");
  return validateAnalysis(JSON.parse(text));
}
