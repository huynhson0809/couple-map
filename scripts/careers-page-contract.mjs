import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_CAREERS_EMAIL,
  createCareersMailto,
} from "../src/config/careers.ts";

const read = (path) => readFileSync(resolve(path), "utf8");

const packageJson = JSON.parse(read("package.json"));
const app = read("src/App.tsx");
const page = read("src/pages/CareersPage.tsx");
const content = read("src/content/publicPages.ts");
const environmentExample = read(".env.example");
const vercel = read("vercel.json");
const llms = read("public/llms.txt");

assert.equal(
  packageJson.scripts["check:careers-page"],
  "node --experimental-strip-types scripts/careers-page-contract.mjs",
  "package.json should expose the Careers page contract.",
);

assert.equal(
  DEFAULT_CAREERS_EMAIL,
  "pinly.sp@gmail.com",
  "The Careers page should use the Pinly Gmail inbox directly.",
);
assert.match(
  createCareersMailto(DEFAULT_CAREERS_EMAIL, "en"),
  /^mailto:pinly\.sp@gmail\.com\?subject=/,
  "The application action should open a prefilled email draft.",
);

assert.match(
  content,
  /careers:\s*\{[\s\S]*path: "\/careers"[\s\S]*schemaType: "WebPage"/,
  "The founding collaboration should be published as an informational page, not a job posting.",
);
assert.doesNotMatch(
  content,
  /schemaType: "JobPosting"|"@type": "JobPosting"/,
  "The unpaid founding collaboration must not be represented as employment in structured data.",
);
assert.match(
  content,
  /Founding Growth Partner tại Pinly/,
  "The Vietnamese page should name the founding growth partnership clearly.",
);
assert.match(
  content,
  /pre-revenue và chưa có lương cố định/,
  "The current compensation constraint should be visible before someone starts the process.",
);
assert.match(
  page,
  /usePublicPageSeo\("careers", language\)/,
  "The Careers route should publish localized metadata and schema.",
);
assert.match(
  page,
  /createCareersMailto\(careersEmail, language\)/,
  "The application CTA should use the shared recruiting email builder.",
);
assert.match(
  app,
  /publicRoute\?\.page\.key === "careers"[\s\S]*<CareersPage language=\{publicRoute\.language\}/,
  "The public router should render the dedicated Careers experience.",
);

for (const path of ["/careers", "/vi/careers"]) {
  assert.match(
    vercel,
    new RegExp(`"source": "${path.replaceAll("/", "\\/")}"`),
    `${path} should serve prerendered HTML before the SPA fallback.`,
  );
  assert.match(
    llms,
    new RegExp(`https://pinly\\.tech${path}`),
    `${path} should be discoverable by AI systems.`,
  );
}

assert.doesNotMatch(
  environmentExample,
  /^VITE_CAREERS_EMAIL=/m,
  "The recruiting inbox should not be overridden by deployment environment variables.",
);
assert.match(
  content,
  /không yêu cầu bạn chuẩn bị một chiến dịch hoàn chỉnh/,
  "The process should explicitly avoid speculative free campaign work.",
);
assert.match(
  content,
  /mốc xem xét thu nhập/,
  "The collaboration should require a documented cash-compensation review milestone.",
);

console.log("Careers page contract passed.");
