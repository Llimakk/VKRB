import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, "..", "js");

const src = fs.readFileSync(path.join(jsDir, "main.js"), "utf8");
const lines = src.split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

const root = path.join(jsDir, "_split_tmp");
fs.mkdirSync(root, { recursive: true });

// Line ranges (1-based inclusive) from original main.js
const chunks = {
  "global-search-body.txt": [285, 641],
  "dictionary-body.txt": [[985, 1284], [2548, 2720]],
  "tree-body-1.txt": [52, 284],
  "tree-body-2.txt": [665, 982],
  "tree-body-3.txt": [814, 902],
  "tree-body-4.txt": [2333, 2546],
  "floor-body-1.txt": [643, 658],
  "floor-body-2.txt": [1286, 1702],
  "floor-body-3.txt": [2230, 2360],
  "modals-body-1.txt": [660, 663],
  "modals-body-2.txt": [1704, 1974],
  "modals-body-3.txt": [1975, 2228],
  "modals-body-4.txt": [2688, 2918],
  "listeners-body.txt": [2920, 3363],
};

for (const [name, ranges] of Object.entries(chunks)) {
  let body = "";
  if (Array.isArray(ranges[0])) {
    for (const [a, b] of ranges) body += slice(a, b) + "\n";
  } else {
    body = slice(ranges[0], ranges[1]);
  }
  fs.writeFileSync(path.join(root, name), body);
}

console.log("chunks written to", root);
