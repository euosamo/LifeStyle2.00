import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const publicFiles = [
  "index.html",
  "firebase-login.js",
  "firebase-environment.js",
  "backup-utils.js",
  "sw.js",
  "manifest.webmanifest",
  "apple-touch-icon.png.png",
  "icon-192.png",
  "icon-512.png",
  "icon-ls.svg",
  "_headers"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of publicFiles) {
  await cp(join(root, file), join(output, file));
}
console.log(`Built ${publicFiles.length} allowlisted public files into dist/.`);
