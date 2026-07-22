import {
  PUBLIC_PAGES,
  PUBLIC_POLICY_PATHS,
  getLocalizedPublicPath,
} from "../src/content/publicPages.ts";

const HOST = "pinly.tech";
const KEY = "6b4e9d7c1a8f3e2b5c0d9a7f4e1c8b6d";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const basePaths = [
  ...Object.values(PUBLIC_PAGES).map((page) => page.path),
  ...PUBLIC_POLICY_PATHS,
];
const urlList = basePaths.flatMap((path) =>
  ["en", "vi"].map(
    (language) =>
      `https://${HOST}${getLocalizedPublicPath(path, language)}`,
  ),
);

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
