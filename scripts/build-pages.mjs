import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const publicFiles = [
  "_headers",
  "index.html",
  "app.js",
  "backup-utils.js",
  "firebase-login.js",
  "styles.css",
  "sw-register.js",
  "sw.js",
  "manifest.webmanifest",
  "apple-touch-icon.png.png",
  "icon-192.png",
  "icon-512.png"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: