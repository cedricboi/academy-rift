// ===== Academy Rift — topic & Bloom's taxonomy metadata (SHARED, client-safe) =====
// Imported by BOTH the server (to filter the question pool) and the client
// (lobby topic picker + in-battle Bloom badge). Contains no answers, so it is
// safe to ship to the browser.

export const TOPICS = [
  { id: "mixed",  name: "Mixed — All Topics",      icon: "🎲", blurb: "Every topic, all Bloom's levels." },
  { id: "micro",  name: "Microscope Basics",       icon: "🔬", blurb: "Parts, safe use, making a slide." },
  { id: "parts",  name: "Cell Parts & Functions",  icon: "🧫", blurb: "Nucleus, membrane, wall, vacuole, chloroplast." },
  { id: "models", name: "Plant vs Animal Cells",   icon: "🧠", blurb: "Cell types & how they differ." },
  { id: "org",    name: "Cells & Organisms",       icon: "🏛️", blurb: "Cell → tissue → organ → organism." },
  { id: "labour", name: "Cell Division & Growth",  icon: "⚙️", blurb: "How cells divide, grow & specialise." },
  { id: "tech",   name: "Cells & Technology",      icon: "🚀", blurb: "Microscopy history, cloning, medicine." },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

// Bloom's taxonomy cognitive levels, ordered from lower- to higher-order thinking.
// Each question in questions.js is tagged with one of these so every topic deck
// spans a range of thinking skills.
export const BLOOM_META = {
  Remember:   { icon: "📗", color: "#7CF29B", tip: "Recall facts" },
  Understand: { icon: "📘", color: "#5FD0FF", tip: "Explain ideas" },
  Apply:      { icon: "📙", color: "#FFD23F", tip: "Use in a new context" },
  Analyse:    { icon: "📕", color: "#FF9F45", tip: "Break down & infer" },
  Evaluate:   { icon: "📓", color: "#FF6DE0", tip: "Judge & justify" },
};

export const BLOOM_ORDER = ["Remember", "Understand", "Apply", "Analyse", "Evaluate"];
