import {
  PUBLIC_PAGES,
} from "../src/content/publicPages.ts";

const HOST = "pinly.tech";
const KEY = "6b4e9d7c1a8f3e2b5c0d9a7f4e1c8b6d";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const urlList = [
  ...Object.values(PUBLIC_PAGES).map(
    (page) => `https://${HOST}${page.path === "/" ? "/" : page.path}`,
  ),
  `https://${HOST}/privacy`,
  `https://${HOST}/terms`,
];

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList,
};

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const response = await fetch("https://api.indexnow.org/IndexNow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`IndexNow submission failed (${response.status}): ${body}`);
}

console.log(`Submitted ${urlList.length} Pinly URLs to IndexNow.`);
