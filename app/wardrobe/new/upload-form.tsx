"use client";

import { useState } from "react";
import { uploadAndAnalyze } from "./actions";

const targetBytes = 3.5 * 1024 * 1024;
const maxDimension = 1800;

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败")), "image/jpeg", quality);
  });
}

async function compressForUpload(file: File) {
  if (file.size <= targetBytes && file.type !== "image/png") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理这张图片");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = 0.86;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > targetBytes && quality > 0.5) {
    quality -= 0.08;
    blob = await canvasToJpeg(canvas, quality);
  }
  if (blob.size > targetBytes) throw new Error("图片仍然过大，请换一张图片后重试");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function UploadForm() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setError("");
    setStatus("正在准备图片…");
    try {
      const image = formData.get("image");
      if (!(image instanceof File) || image.size === 0) throw new Error("请选择一张单品照片");
      const ready = await compressForUpload(image);
      formData.set("image", ready);
      setStatus("正在上传并识别，通常需要十几秒…");
      await uploadAndAnalyze(formData);
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "上传失败，请重试");
    }
  }

  return (
    <form action={submit}>
      {error && <div className="notice error">{error}</div>}
      {status && <div className="notice success">{status}</div>}
      <label className="file-drop">
        <span className="file-icon">＋</span>
        <strong>选择 JPG、PNG 或 WebP</strong>
        <small>大图会自动压缩，不需要手动处理</small>
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required />
      </label>
      <button className="button primary" type="submit" disabled={Boolean(status)}>上传并识别</button>
    </form>
  );
}
