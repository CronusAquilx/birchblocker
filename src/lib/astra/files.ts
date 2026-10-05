import type { FileUIPart } from "ai";

export const MAX_FILES = 15;
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
const MAX_TEXT_CHARS = 300_000;

export type Attachment =
  | { kind: "text"; name: string; content: string }
  | { kind: "image"; name: string; part: FileUIPart };

async function readPdf(f: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

async function readDocx(f: File) {
  const mammoth = await import("mammoth");
  const res = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
  return res.value;
}

/** Shrinks photos so many can be sent at once; falls back to the original file if the browser can't decode it (e.g. HEIC). */
async function readImage(f: File): Promise<FileUIPart> {
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return { type: "file", mediaType: "image/jpeg", filename: f.name, url: canvas.toDataURL("image/jpeg", 0.82) };
  } catch {
    const url = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });
    return { type: "file", mediaType: f.type || "image/jpeg", filename: f.name, url };
  }
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;
const isText = (bytes: Uint8Array) => !bytes.slice(0, 8000).includes(0);

async function readZip(f: File) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
  const out: string[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith("/")) continue;
    out.push(isText(bytes) ? `--- ${path} ---\n${strFromU8(bytes)}` : `--- ${path} --- (binary, ${bytes.length} bytes)`);
  }
  return `ZIP archive with ${out.length} files:\n\n${out.join("\n\n")}`;
}

export async function readAttachment(f: File): Promise<Attachment> {
  const lower = f.name.toLowerCase();
  if (f.type.startsWith("image/") || IMAGE_EXT.test(lower)) return { kind: "image", name: f.name, part: await readImage(f) };
  let content: string;
  if (lower.endsWith(".pdf") || f.type === "application/pdf") content = await readPdf(f);
  else if (lower.endsWith(".docx")) content = await readDocx(f);
  else if (lower.endsWith(".zip")) content = await readZip(f);
  else {
    const bytes = new Uint8Array(await f.arrayBuffer());
    content = isText(bytes)
      ? new TextDecoder().decode(bytes)
      : `(Binary file "${f.name}", type ${f.type || "unknown"}, ${bytes.length} bytes. Its contents can't be shown as text.)`;
  }
  if (content.length > MAX_TEXT_CHARS) content = content.slice(0, MAX_TEXT_CHARS) + "\n…[truncated]";
  return { kind: "text", name: f.name, content };
}
