import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readNamedFunctionBody(source, functionName) {
  const sourceFile = ts.createSourceFile(
    "ThemeContext.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let bodyText = null;
  let functionFound = false;

  const visit = (node) => {
    if (functionFound) return;

    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName && node.body) {
      const start = node.body.getStart(sourceFile) + 1;
      const end = node.body.getEnd() - 1;
      bodyText = source.slice(start, end);
      functionFound = true;
      return;
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== functionName) {
          continue;
        }

        const initializer = declaration.initializer;
        if (
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          initializer.body
        ) {
          if (ts.isBlock(initializer.body)) {
            const start = initializer.body.getStart(sourceFile) + 1;
            const end = initializer.body.getEnd() - 1;
            bodyText = source.slice(start, end);
            functionFound = true;
            return;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  if (!functionFound) return null;
  return bodyText;
}
function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const themeContext = readProjectFile("src/hooks/ThemeContext.tsx");
const settingsPage = readProjectFile("src/pages/SettingsPage.tsx");
const styles = readProjectFile("src/index.css");
const indexHtml = readProjectFile("index.html");
const viteConfig = readProjectFile("vite.config.ts");

assert.doesNotMatch(
  themeContext,
  /DARK_MODE_ENABLED\s*=\s*false/,
  "ThemeContext must not disable dark mode with DARK_MODE_ENABLED = false.",
);

assert.doesNotMatch(
  themeContext,
  /isDarkModeEnabled/,
  "ThemeContext should not keep a dead isDarkModeEnabled compatibility gate.",
);

const readStoredThemeBody = readNamedFunctionBody(themeContext, "readStoredTheme");
const updateThemeColorBody = readNamedFunctionBody(
  themeContext,
  "updateThemeColor",
);
const themeProviderBody = readNamedFunctionBody(themeContext, "ThemeProvider");

assert.doesNotMatch(
  themeContext,
  /prefers-color-scheme:\s*dark/,
  "Manual dark mode v1 must not auto-follow the device system theme.",
);

assert.match(
  themeContext,
  /type\s+Theme\s*=\s*["']light["']\s*\|\s*["']dark["']/,
  "ThemeContext should keep the theme union limited to light and dark.",
);

assert.match(
  themeContext,
  /const\s+KEY\s*=\s*["']pinly\.theme["']/,
  "ThemeContext should keep the existing pinly.theme localStorage key.",
);

assert.ok(
  readStoredThemeBody,
  "ThemeContext should define readStoredTheme(theme) for reading persisted theme.",
);
assert.match(
  readStoredThemeBody,
  /try\s*\{[\s\S]*localStorage\.getItem\(KEY\)[\s\S]*\}\s*catch/,
  "ThemeContext should guard localStorage reads for constrained browser modes.",
);

assert.ok(
  themeProviderBody,
  "ThemeContext should define ThemeProvider that applies the selected theme and persists it.",
);
assert.match(
  themeProviderBody,
  /try\s*\{[\s\S]*localStorage\.setItem\(KEY,\s*theme\)[\s\S]*\}\s*catch/,
  "ThemeContext should guard localStorage writes for constrained browser modes.",
);

assert.match(
  themeContext,
  /document\.documentElement\.dataset\.theme\s*=\s*theme/,
  "ThemeContext should apply the selected theme to documentElement.dataset.theme.",
);

assert.match(
  themeContext,
  /querySelector\(["']meta\[name="theme-color"\]["']\)/,
  "ThemeContext should update the mobile browser theme-color meta tag.",
);

assert.ok(
  updateThemeColorBody,
  "ThemeContext should define updateThemeColor(theme) for syncing mobile theme color metadata.",
);
assert.match(
  updateThemeColorBody,
  /querySelector\(["']meta\[name="theme-color"\]["']\)[\s\S]*(?:setAttribute\(["']content["']|\.content\s*=)/,
  "ThemeContext should set the theme-color meta content explicitly.",
);

assert.match(
  indexHtml,
  /<meta\s+name=["']theme-color["']\s+content=["']#fff8fa["']/,
  "index.html should default mobile theme-color to the light theme before React starts.",
);

const themeBootstrapIndex = indexHtml.indexOf('localStorage.getItem("pinly.theme")');
const appEntryIndex = indexHtml.indexOf('src="/src/main.tsx"');
assert.ok(
  themeBootstrapIndex >= 0 && themeBootstrapIndex < appEntryIndex,
  "index.html should apply the stored theme before loading the React entry.",
);

assert.match(
  indexHtml,
  /document\.documentElement\.dataset\.theme\s*=\s*theme[\s\S]*document\.documentElement\.style\.colorScheme\s*=\s*theme/,
  "index.html bootstrap should apply data-theme and color-scheme before first paint.",
);

assert.match(
  indexHtml,
  /querySelector\(["']meta\[name="theme-color"\]["']\)[\s\S]*setAttribute\(\s*["']content["']/,
  "index.html bootstrap should sync the initial theme-color meta content.",
);

assert.match(
  viteConfig,
  /theme_color:\s*["']#fff8fa["'][\s\S]*background_color:\s*["']#fff8fa["']/,
  "PWA manifest defaults should use the light theme colors.",
);

assert.doesNotMatch(
  settingsPage,
  /isDarkModeEnabled/,
  "SettingsPage should not hide the Light/Dark control behind isDarkModeEnabled.",
);

assert.match(
  settingsPage,
  /title=\{t\(["']settings\.appearance["']\)\}/,
  "SettingsPage should always render the Appearance section.",
);

assert.match(
  settingsPage,
  /value:\s*["']light["'][\s\S]*settings\.themeLight[\s\S]*value:\s*["']dark["'][\s\S]*settings\.themeDark/,
  "SettingsPage should expose Light and Dark options in the theme segmented control.",
);

assert.match(
  settingsPage,
  /value=\{theme\}[\s\S]*onChange=\{setTheme\}/,
  "SettingsPage theme segmented control should bind to theme and setTheme.",
);

assert.match(
  styles,
  /:root\s*\{[\s\S]*color-scheme:\s*light;/,
  "Root CSS should declare light color-scheme.",
);

assert.match(
  styles,
  /\[data-theme=["']dark["']\]\s*\{[\s\S]*color-scheme:\s*dark;/,
  "Dark theme CSS should declare dark color-scheme.",
);

assert.doesNotMatch(
  styles,
  /\[data-theme=["']dark["']\]\s*\{[\s\S]*--map-filter:\s*invert\(/,
  "Dark mode should not use an aggressive invert filter on the map canvas.",
);

assert.match(
  styles,
  /\[data-theme=["']dark["']\]\s*\{[\s\S]*--glass-section-bg:\s*linear-gradient\([^;]*rgba\([^,]+,[^,]+,[^,]+,\s*0\.8/,
  "Dark mode glass sections should be mostly opaque so content stays readable over photo backgrounds.",
);

assert.match(
  styles,
  /\[data-theme=["']dark["']\]\s*:where\([^)]*\.timeline-card[^)]*\.notif-item[^)]*\.setting-section/s,
  "Dark mode should lower the global glass highlight for content surfaces.",
);

for (const selector of [
  ".timeline-card",
  ".sheet:has(.pin-form)",
  ".sheet:has(.pin-detail)",
  ".page-notifications .notif-item",
  ".app-shell.has-bg .setting-section",
  ".streak-card",
  ".stats-panel",
  ".stat-card",
  ".timeline-circle-stage",
  ".bottom-nav",
  ".category-chip",
]) {
  assert.match(
    styles,
    new RegExp(`\\[data-theme=["']dark["']\\]\\s+${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    `Dark mode should define a premium treatment for ${selector}.`,
  );
}

assert.doesNotMatch(
  styles,
  /\[data-theme=["']dark["']\]\s+\.page-header h1\s*\{[\s\S]*#ffd4d4/,
  "Dark page headlines should not use the washed-out pastel pink gradient.",
);

assert.match(
  styles,
  /\[data-theme=["']dark["']\]\s+\.page-header h1\s*\{[\s\S]*#ff5a66/,
  "Dark page headlines should use the stronger Pinly coral headline treatment.",
);

assert.match(
  styles,
  /\.page-settings\s+\.page-header h1\s*\{[\s\S]*font-size:\s*28px;/,
  "Settings headline should use the same title scale as other page headlines.",
);

assert.doesNotMatch(
  styles,
  /\.page-settings\s+\.page-header h1\s*\{[^}]*font-size:\s*clamp\(/,
  "Settings headline should not use an oversized responsive clamp.",
);

for (const selector of [
  ".setting-section-plan",
  ".setting-plan-meta",
  ".pricing-overlay .pricing-page",
  ".pricing-cycle-toggle",
  ".pricing-card",
  ".pricing-card-pro",
  ".pricing-current-badge",
  ".pricing-features li",
]) {
  assert.match(
    styles,
    new RegExp(`\\[data-theme=["']dark["']\\]\\s+${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    `Dark mode should define a readable premium treatment for ${selector}.`,
  );
}

console.log("Dark mode contract passed.");
