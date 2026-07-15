---
name: aha-wardrobe
description: Manage a personal wardrobe through conversation. Use when a user uploads a clothing image, wants to add or view wardrobe items, asks what they own, or requests outfits using existing items first. Image understanding comes from the host agent; modification and deletion are completed in the private web wardrobe.
---

# Aha Wardrobe

Use the host agent's native vision and reasoning. Never call a separate paid vision API and never claim the Aha server analyzed an image.

## Start a session

1. Find the user's Aha access code in the current conversation.
2. If absent, ask for it once. Treat it as a secret and never repeat it in responses.
3. Call `verify_access` before the first wardrobe operation.

## Add an item from an image

1. Inspect the user-provided image directly.
2. Determine whether it is a catalog-style single-item image or a try-on/on-body image containing a person and possibly several wearable items.
3. Resolve exactly one target item:
   - If the user explicitly identifies one visible item, such as “买了这件上衣”, use that item.
   - If the user does not identify an item, or several items match the description, ask one concise question such as `这张图里有上衣和半身裙，你要添加哪一件？` Do not create a record yet.
   - Process only one wardrobe item per save operation. The user may repeat the flow for another item from the same photo.
4. Infer a concise Chinese name, category, subcategory, up to two colors, and seasons for the resolved target.
5. For a catalog-style image, present the normal compact confirmation using category, seasons, and colors. Allow multiple seasons and at most two colors.
6. For a try-on/on-body image, use the host's own image-editing capability to create a front-facing catalog preview of only the target item on a pure white background. Remove the person, skin, hair, hands, other garments, props, text, shop UI, and scene. Preserve the visible silhouette, neckline, sleeve length, hem, fabric, pattern, seams, logos, and colors. Reconstruct small occluded areas conservatively from visible symmetry; never invent prints, logos, pockets, fasteners, or decorations that are not supported by the source.
7. If the target's defining structure is heavily hidden, layered under another garment, extremely small, blurred, or cut off by the image edge, do not fabricate a catalog image. Ask for a clearer try-on angle or a flat-lay/hanger photo.
8. For a try-on/on-body image, show the processed catalog preview together with the three confirmation dimensions and ask the user to confirm. Do not save before this preview confirmation.
9. After confirmation, call `add_wardrobe_item`, then immediately call `attach_item_image` with the confirmed processed image and returned item ID. Prefer the standard ChatGPT `file` input when the edited preview is available as a file; otherwise use a host temporary HTTPS URL. In Codex, encode the local edited image and pass `image_base64` with its `mime_type`. Never attach the original try-on photo. These two calls form one logical save operation.
10. Call `list_wardrobe_items` and confirm that the returned exact item has `has_image: true`. Do not say the item was saved until creation, attachment, and this verification all succeed. If image attachment fails, retry it; if it cannot be completed, clearly report that saving did not complete.

Use the taxonomy in [references/taxonomy.md](references/taxonomy.md).

## Manage the wardrobe

- Call `list_wardrobe_items` before answering what the user owns.
- Do not modify or delete a wardrobe item from natural-language conversation. Names can be ambiguous and the MCP intentionally does not expose these destructive tools.
- When the user asks to modify, reorder, or delete an item, call `get_wardrobe_summary` and return its `management_url`. The authenticated web wardrobe provides exact item selection, tag editing, drag sorting, and deletion confirmation.
- Call `get_wardrobe_summary` when the user asks for an overview.
- When the user asks to see or open the wardrobe, call `get_wardrobe_summary` and reply with only its stable `wardrobe_url` as a clickable link. The URL contains a separate read-only view UUID, never the `AHA-...` access code. Do not add item counts, inventory, explanations, apologies, or other prose unless the user explicitly requests a text summary.

## Recommend outfits

1. Call `list_wardrobe_items` with a sufficiently high limit.
2. Build 1–3 outfits from existing items first.
3. Call `create_outfit_board` with the exact selected item IDs. It returns a square collage made from the real wardrobe item images on a clean, very light Morandi solid background. Tops appear above bottoms, shoes below, and bags at the sides; garments remain visually dominant while shoes and bags use realistic smaller proportions. Do not generate try-on people.
4. Display the returned image directly inside the conversation. Do not reply with `outfit_url` when the image content is available; use the link only as a fallback when the host cannot render the returned image.
5. Before mentioning any purchase, call `check_purchase_gap` with the categories required by the proposed outfit. If `may_suggest_purchase` is false, do not recommend buying anything and finish the outfit with owned items. If true, describe only the first returned missing category/specification; do not recommend a store or shopping link.

## Response style

Keep confirmations short and conversational. Prefer clickable host UI when available. When only text is available, use compact lines such as `类别：下装｜季节：夏｜颜色：黑色`. A successful add response may be one short line; a wardrobe-open response must be the link only.
