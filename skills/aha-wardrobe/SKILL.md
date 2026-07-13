---
name: aha-wardrobe
description: Manage a personal wardrobe through conversation. Use when a user uploads a clothing image, wants to add, list, edit, or remove wardrobe items, asks what they own, or requests outfits using existing items first. Analyze images with the host agent's own vision capability and use the Aha remote MCP only for persistent storage and retrieval.
---

# Aha Wardrobe

Use the host agent's native vision and reasoning. Never call a separate paid vision API and never claim the Aha server analyzed an image.

## Start a session

1. Find the user's Aha access code in the current conversation.
2. If absent, ask for it once. Treat it as a secret and never repeat it in responses.
3. Call `verify_access` before the first wardrobe operation.

## Add an item from an image

1. Inspect the user-provided image directly.
2. Identify one main wearable item. Ignore product-page prices, thumbnails, models, and interface chrome.
3. Infer a concise Chinese name, category, subcategory, up to two colors, and seasons.
4. If several independent items are present or confidence is low, ask one concise question before saving.
5. Present a compact confirmation using only three dimensions: category, seasons, and colors. Allow multiple seasons and at most two colors.
6. After confirmation, call `add_wardrobe_item`. Do not save before confirmation.

Use the taxonomy in [references/taxonomy.md](references/taxonomy.md).

## Manage the wardrobe

- Call `list_wardrobe_items` before answering what the user owns.
- Call `update_wardrobe_item` only after identifying one exact item.
- Require explicit confirmation immediately before `delete_wardrobe_item`.
- Call `get_wardrobe_summary` when the user asks for an overview.
- When the user asks to see the wardrobe, return the visual wardrobe URL. Do not replace the visual result with a text-only inventory unless the user asks for text.

## Recommend outfits

1. Call `list_wardrobe_items` with a sufficiently high limit.
2. Build 1–3 outfits from existing items first.
3. Return a white-background product collage made from the real wardrobe item images: top near the upper area, bottom in the center, shoes and bag/accessories around it, with restrained connector lines and short Chinese labels. Do not generate try-on people.
4. Prefer a directly displayed outfit-board image; include its link as fallback.
5. Suggest a purchase only when no reasonable owned substitute exists. Describe one missing specification; do not recommend a store or shopping link.

## Response style

Keep confirmations short and conversational. Prefer clickable host UI when available. When only text is available, use compact lines such as `类别：下装｜季节：夏｜颜色：黑色`.
