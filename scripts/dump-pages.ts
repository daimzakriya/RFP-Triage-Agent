/** Print the cleaned per-page text the agent sees. Usage: npx tsx scripts/dump-pages.ts file.pdf */
import { readFile } from "node:fs/promises";
import { extractPdfPages } from "../lib/pdf";
const file = process.argv[2];
if (!file) throw new Error("Usage: tsx scripts/dump-pages.ts <file.pdf>");
const { pages } = await extractPdfPages(new Uint8Array(await readFile(file)));
pages.forEach((p, i) => console.log(`\n[[PAGE ${i + 1}]]\n${p}`));
