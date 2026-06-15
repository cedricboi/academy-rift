// One-time asset optimizer: re-encode heavy PNG art to WebP.
// - lossless WebP for art that the client post-processes pixel-by-pixel
//   (black-knockout / transparentize / trim) so those thresholds stay exact
// - quality-80 lossy WebP for display-only art
// Originals are backed up outside the repo; this writes <name>.webp alongside
// each <name>.png and leaves the PNGs in place (removed via git after review).
import sharp from "sharp";
import { readdir, stat } from "fs/promises";
import { join, extname, basename, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets");

// folder -> encode mode
const FOLDERS = {
  "Attack Costume": "lossless",
  "Chracter Art Transparent background": "lossless",
  "Player cards": "lossless",
  "Character Card": "lossy",
  "Chracter Card Information": "lossy",
  "Ultimate Scene": "lossy",
  "Character Profile Art": "lossy",
  "Skill Menu Art": "lossy",
};
// loose background files (display only)
const LOOSE = ["Landing Page.png", "Opening Scene.png", "CASTLE BACKGROUND.png", "Question.png"];

const enc = (img, mode) =>
  mode === "lossless"
    ? img.webp({ lossless: true, effort: 6 })
    : img.webp({ quality: 80, effort: 6 });

let inBytes = 0, outBytes = 0, count = 0;

async function convert(absPng, mode) {
  const absWebp = join(dirname(absPng), basename(absPng, ".png") + ".webp");
  const before = (await stat(absPng)).size;
  await enc(sharp(absPng), mode).toFile(absWebp);
  const after = (await stat(absWebp)).size;
  inBytes += before; outBytes += after; count++;
  return { before, after };
}

const MB = (n) => (n / 1048576).toFixed(1);

for (const [folder, mode] of Object.entries(FOLDERS)) {
  const dir = join(ROOT, folder);
  const files = (await readdir(dir)).filter((f) => extname(f).toLowerCase() === ".png");
  let fIn = 0, fOut = 0;
  for (const f of files) {
    const { before, after } = await convert(join(dir, f), mode);
    fIn += before; fOut += after;
  }
  console.log(`${folder.padEnd(38)} [${mode}]  ${MB(fIn)}MB -> ${MB(fOut)}MB  (${files.length} files)`);
}

for (const f of LOOSE) {
  const abs = join(ROOT, f);
  try { const { before, after } = await convert(abs, "lossy");
    console.log(`${f.padEnd(38)} [lossy]     ${MB(before)}MB -> ${MB(after)}MB`); }
  catch (e) { console.log(`${f}: SKIP (${e.message})`); }
}

console.log(`\nTOTAL: ${count} files  ${MB(inBytes)}MB -> ${MB(outBytes)}MB  (${(100*(1-outBytes/inBytes)).toFixed(0)}% smaller)`);
