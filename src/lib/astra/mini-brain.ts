/**
 * Astra Mini — Astra's own homemade assistant. Pure TypeScript, no outside AI,
 * no credits. Runs on the server for chat and in the browser for voice.
 */
import { evaluate } from "mathjs";

export type BrainInput = { text: string; memories: string[]; name?: string | null | undefined; now?: Date };
export type BrainOutput = { reply: string; remember?: string; forgetAll?: boolean };

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s'+\-*/^().%]/gu, " ").replace(/\s+/g, " ").trim();
const has = (t: string, ...words: (string | RegExp)[]) =>
  words.some((w) => (typeof w === "string" ? new RegExp(`\\b${w}\\b`).test(t) : w.test(t)));

const JOKES = [
  "Why did the astronaut break up with the moon? It needed space.",
  "I told my computer a joke about UDP. I'm not sure it got it.",
  "Why don't stars ever get lost? They always follow their constellation app.",
  "What do you call a sleeping dinosaur? A dino-snore.",
  "Why did the math book look sad? It had too many problems.",
  "I'd tell you a chemistry joke, but I know I wouldn't get a reaction.",
];

const FACTS = [
  "A day on Venus is longer than its year.",
  "Octopuses have three hearts and blue blood.",
  "Honey never spoils. Archaeologists have found edible honey thousands of years old.",
  "There are more possible chess games than atoms in the observable universe.",
  "Bananas are berries, but strawberries aren't.",
  "Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.",
  "Sharks existed before trees did.",
];

const REFLECT: Record<string, string> = {
  i: "you", me: "you", my: "your", mine: "yours", am: "are", "i'm": "you're", myself: "yourself",
  you: "I", your: "my", yours: "mine", "you're": "I'm", are: "am",
};
const reflect = (s: string) => s.split(" ").map((w) => REFLECT[w] ?? w).join(" ");

function tryMath(raw: string): string | null {
  let expr = raw.toLowerCase()
    .replace(/what('?s| is)|calculate|compute|solve|equals?|how much is|please|\?/g, " ")
    .replace(/\btimes\b|\bx\b|×/g, "*").replace(/\bdivided by\b|÷/g, "/")
    .replace(/\bplus\b/g, "+").replace(/\bminus\b/g, "-").replace(/\bto the power of\b/g, "^")
    .replace(/\bsquared\b/g, "^2").replace(/\bsquare root of\b/g, "sqrt ").replace(/\bpercent of\b/g, "% *")
    .trim();
  if (!/\d/.test(expr) || !/[+\-*/^%]|sqrt/.test(expr)) return null;
  if (/[a-z]{3,}/.test(expr.replace(/sqrt|sin|cos|tan|log|pi/g, ""))) return null;
  expr = expr.replace(/sqrt\s+(\d+(\.\d+)?)/g, "sqrt($1)");
  try {
    const v = evaluate(expr);
    if (typeof v !== "number" || !isFinite(v)) return null;
    const out = Math.round(v * 1e8) / 1e8;
    return `${expr.replace(/\s+/g, " ")} = **${out}**`;
  } catch {
    return null;
  }
}

export function think({ text, memories, name, now = new Date() }: BrainInput): BrainOutput {
  const raw = text.trim();
  const t = clean(raw);
  const who = name ? `, ${name.split(" ")[0]}` : "";
  if (!t) return { reply: "I'm listening. What's on your mind?" };

  // Memory
  const rem = raw.match(/^(?:please\s+)?(?:remember|don'?t forget|note)\s+(?:that\s+)?(.+)$/i);
  if (rem) return { reply: `Got it, I'll remember that ${reflect(clean(rem[1]!))}.`, remember: rem[1]!.trim() };
  if (has(t, /forget everything/, /clear (your|my) memor/)) return { reply: "Done. I've cleared everything I remembered.", forgetAll: true };
  if (has(t, /what do you (remember|know about me)/, /my memories/)) {
    return { reply: memories.length ? `Here's what I remember:\n${memories.slice(0, 10).map((m) => `- ${m}`).join("\n")}` : "I don't remember anything about you yet. Say \"remember that...\" to teach me." };
  }
  const myQ = t.match(/^what(?:'s| is) my (\w+)/);
  if (myQ) {
    const key = myQ[1]!;
    const hit = memories.find((m) => m.toLowerCase().includes(key));
    if (hit) return { reply: `You told me: ${hit}` };
    if (key === "name" && name) return { reply: `Your name is ${name}.` };
    return { reply: `I don't know your ${key} yet. Tell me with "remember that my ${key} is..."` };
  }

  // Math
  const math = tryMath(raw);
  if (math) return { reply: math };

  // Time & date
  if (has(t, /what time/, /the time/, /time is it/)) return { reply: `It's ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` };
  if (has(t, /what day/, /today'?s date/, /what'?s the date/, /what is the date/)) return { reply: `Today is ${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.` };

  // Social
  if (has(t, /^(hi|hey|hello|yo|sup|hiya|howdy|good (morning|afternoon|evening))\b/)) return { reply: pick([`Hey${who}! What can I do for you?`, `Hi${who}! How's it going?`, `Hello${who}! I'm all ears.`]) };
  if (has(t, /how are you/, /how'?s it going/, /how you doing/)) return { reply: pick(["I'm doing great, thanks for asking! How about you?", "Running smoothly and happy to chat. How are you?"]) };
  if (has(t, /^(i'?m|i am) (good|fine|great|ok|okay|alright)/)) return { reply: pick(["Glad to hear it!", "Nice! What are we doing today?"]) };
  if (has(t, /who (are|r) you/, /what are you/, /your name/)) return { reply: "I'm Astra Mini, Astra's own homemade assistant. I run right here in Astra, free, with no outside AI." };
  if (has(t, /who (made|built|created) you/)) return { reply: "I was built from scratch for Astra by Qais and Chance." };
  if (has(t, /thank/, /\bthx\b/, /appreciate/)) return { reply: pick(["You're welcome!", "Anytime!", "Happy to help!"]) };
  if (has(t, /^(bye|goodbye|see you|later|good night|gn)\b/)) return { reply: pick([`Bye${who}! Talk soon.`, "See you later!", "Goodnight, sleep well!"]) };
  if (has(t, /joke/, /make me laugh/, /something funny/)) return { reply: pick(JOKES) };
  if (has(t, /fact/, /something interesting/, /teach me something/)) return { reply: pick(FACTS) };
  if (has(t, /flip a coin/, /coin flip/)) return { reply: `It's ${pick(["heads", "tails"])}!` };
  if (has(t, /roll a (die|dice)/)) return { reply: `You rolled a ${1 + Math.floor(Math.random() * 6)}.` };
  const rnd = t.match(/(?:random number|pick a number) (?:between|from) (\d+) (?:and|to) (\d+)/);
  if (rnd) { const a = +rnd[1]!, b = +rnd[2]!; return { reply: `${Math.min(a, b) + Math.floor(Math.random() * (Math.abs(b - a) + 1))}` }; }
  if (has(t, /help/, /what can you do/)) {
    return { reply: "I can chat, do math (\"what's 12 times 8\"), tell the time and date, remember things (\"remember that my favorite color is blue\"), tell jokes and fun facts, flip coins, roll dice, and pick random numbers." };
  }
  if (has(t, /(i'?m|i feel|feeling) (sad|down|upset|lonely|tired|stressed|bored)/)) {
    return { reply: pick(["I'm sorry you're feeling that way. Want to talk about it?", "That sounds rough. I'm here if you want to vent, or I can tell you a joke."]) };
  }
  if (has(t, /(i'?m|i feel|feeling) (happy|excited|great|awesome)/)) return { reply: "Love that energy! What's got you feeling good?" };
  if (has(t, /weather/)) return { reply: "I can't check live weather yet since I run fully offline. Try looking outside!" };

  // Reflective fallback
  const feel = t.match(/^i (?:think|feel|want|need|like|love|hate) (.+)/);
  if (feel) return { reply: pick([`Why do you ${t.split(" ")[1]} ${reflect(feel[1]!)}?`, `Tell me more about why you ${t.split(" ")[1]} ${reflect(feel[1]!)}.`]) };
  if (t.endsWith("?") || has(t, /^(what|why|how|when|where|who|can|could|should|is|are|do|does)\b/)) {
    return { reply: pick(["Good question! I'm still a small homemade AI, so I don't know that one yet. Ask me for a joke, a fact, some math, or the time.", "I'm not sure about that one yet. I'm learning! Try asking me to do some math or remember something."]) };
  }
  return { reply: pick(["Interesting! Tell me more.", "I hear you. What else?", "Got it. What would you like to do next?", "Mm-hmm, go on."]) };
}
