export type CaptionTrack = {
  id: string;
  language: string;
  label: string;
  fileName?: string;
  url: string;
};

export type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

const LANGUAGE_NAMES: Record<string, string> = {
  ara: "Arabic", bul: "Bulgarian", chi: "Chinese", cze: "Czech", dan: "Danish",
  dut: "Dutch", ell: "Greek", eng: "English", est: "Estonian", fin: "Finnish",
  fre: "French", ger: "German", heb: "Hebrew", hin: "Hindi", hrv: "Croatian",
  hun: "Hungarian", ice: "Icelandic", ita: "Italian", jpn: "Japanese", kor: "Korean",
  mac: "Macedonian", nld: "Dutch", nor: "Norwegian", per: "Persian", pob: "Portuguese (Brazil)",
  pol: "Polish", por: "Portuguese", ron: "Romanian", rum: "Romanian", rus: "Russian",
  slv: "Slovenian", spa: "Spanish", srp: "Serbian", swe: "Swedish", tha: "Thai",
  tur: "Turkish", ukr: "Ukrainian", vie: "Vietnamese",
};

export const captionLanguageName = (code: string) => LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();

function timestamp(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function parseCaptionFile(source: string): CaptionCue[] {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const blocks = normalized.split(/\n{2,}/);
  const cues: CaptionCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [startRaw, endWithSettings] = lines[timingIndex].split("-->");
    if (!startRaw || !endWithSettings) continue;
    const endRaw = endWithSettings.trim().split(/\s+/)[0];
    const start = timestamp(startRaw);
    const end = timestamp(endRaw);
    if (start === null || end === null || end <= start) continue;
    const text = lines.slice(timingIndex + 1).join("\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    if (text) cues.push({ start, end, text });
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function activeCaption(cues: CaptionCue[], currentTime: number): CaptionCue | undefined {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];
    if (!cue) return undefined;
    if (currentTime < cue.start) high = middle - 1;
    else if (currentTime > cue.end) low = middle + 1;
    else return cue;
  }
  return undefined;
}