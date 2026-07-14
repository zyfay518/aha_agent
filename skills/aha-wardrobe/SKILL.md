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
6. After confirmation, use the host's own image-editing capability to extract only the garment and place it on a pure white catalog background. Remove people, hangers, screenshots, shop UI, prices, text, surrounding objects, and the original scene while preserving the exact garment design and colors.
7. Call `add_wardrobe_item`, then immediately call `attach_item_image` with the processed white-background image and returned item ID. Use a host temporary HTTPS URL when available; in Codex, encode the local edited image and pass `image_base64` with its `mime_type`. These two calls form one logical save operation.
8. Call `list_wardrobe_items` and confirm that the returned exact item has `has_image: true`. Do not say the item was saved until creation, attachment, and this verification all succeed. If image attachment fails, retry it; if it cannot be completed, delete or clearly roll back the incomplete record and report that saving did not complete.

Use the taxonomy in [references/taxonomy.md](references/taxonomy.md).

## Manage the wardrobe

- Call `list_wardrobe_items` before answering what the user owns.
- Call `update_wardrobe_item` only after identifying one exact item.
- Require explicit confirmation immediately before `delete_wardrobe_item`.
- Call `get_wardrobe_summary` when the user asks for an overview.
- When the user asks to see or open the wardrobe, call `get_wardrobe_summary` and reply with only its stable `wardrobe_url` as a clickable link. The URL contains a separate read-only view UUID, never the `AHA-...` access code. Do not add item counts, inventory, explanations, apologies, or other prose unless the user explicitly requests a text summary.

## Recommend outfits

1. Call `list_wardrobe_items` with a sufficiently high limit.
2. Build 1–3 outfits from existing items first.
3. Call `create_outfit_board` with the exact selected item IDs. It returns a white-background product collage made from the real wardrobe item images. Do not generate try-on people.
4. Display the returned image directly inside the conversation. Do not reply with `outfit_url` when the image content is available; use the link only as a fallback when the host cannot render the returned image.
5. Suggest a purchase only when no reasonable owned substitute exists. Describe one missing specification; do not recommend a store or shopping link.

## Response style

Keep confirmations short and conversational. Prefer clickable host UI when available. When only text is available, use compact lines such as `类别：下装｜季节：夏｜颜色：黑色`. A successful add response may be one short line; a wardrobe-open response must be the link only.
