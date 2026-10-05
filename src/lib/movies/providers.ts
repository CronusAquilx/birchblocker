export type Provider = { slug: string; name: string; id: number; label: string; bg: string; text: string; font: string };

// Brand chips use each service's own colors (brand assets, not app theme).
const PROVIDERS: Record<string, Omit<Provider, "slug">> = {
  netflix: { name: "Netflix", id: 8, label: "NETFLIX", bg: "bg-[#0b0b0b]", text: "text-[#e50914]", font: "font-black tracking-tighter" },
  prime: { name: "Prime Video", id: 9, label: "prime video", bg: "bg-[#0f1a2b]", text: "text-white", font: "italic font-semibold" },
  disney: { name: "Disney+", id: 337, label: "Disney+", bg: "bg-[#01143b]", text: "text-white", font: "font-semibold tracking-tight" },
  max: { name: "HBO Max", id: 1899, label: "MAX", bg: "bg-[#0a0a12]", text: "text-white", font: "font-black tracking-tight" },
  appletv: { name: "Apple TV+", id: 350, label: "tv+", bg: "bg-black", text: "text-white", font: "font-semibold" },
  hulu: { name: "Hulu", id: 15, label: "hulu", bg: "bg-[#0a0f0a]", text: "text-[#1ce783]", font: "font-black tracking-tight" },
  paramount: { name: "Paramount+", id: 531, label: "Paramount+", bg: "bg-[#0033a0]", text: "text-white", font: "font-semibold" },
  peacock: { name: "Peacock", id: 386, label: "peacock", bg: "bg-[#0b0b0b]", text: "text-white", font: "font-semibold italic" },
};

export const PROVIDER_LIST: Provider[] = Object.entries(PROVIDERS).map(([slug, p]) => ({ slug, ...p }));
export const getProvider = (slug: string) => PROVIDER_LIST.find((p) => p.slug === slug);
