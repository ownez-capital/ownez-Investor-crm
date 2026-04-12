/**
 * Renders docs/user-quick-log-guide.md to a print-ready PDF.
 *
 * Usage:
 *   npx tsx scripts/build-quick-log-pdf.ts
 *
 * Output: docs/user-quick-log-guide.pdf
 *
 * Uses `marked` to convert markdown → HTML, then Playwright's built-in
 * Chromium to print the HTML to PDF with the OwnEZ design language (navy
 * headers, gold accents, generous whitespace). Self-contained — no CDN
 * requirements, no external services. Re-run any time the guide changes.
 */
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright";

const DOC_DIR = resolve("docs");
const MD_PATH = join(DOC_DIR, "user-quick-log-guide.md");
const PDF_PATH = join(DOC_DIR, "user-quick-log-guide.pdf");

const CSS = `
  :root {
    --navy: #0b2049;
    --gold: #e8ba30;
    --gold-soft: #faf0cf;
    --red: #ef4444;
    --green: #10b981;
    --text: #111827;
    --muted: #6b7280;
    --border: #e5e7eb;
    --bg: #ffffff;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: var(--text);
    background: var(--bg);
  }
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 48px;
  }
  h1 {
    color: var(--navy);
    font-size: 26pt;
    font-weight: 700;
    margin: 0 0 8px;
    letter-spacing: -0.01em;
  }
  h2 {
    color: var(--navy);
    font-size: 15pt;
    font-weight: 600;
    margin: 28px 0 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    page-break-after: avoid;
  }
  h3 {
    color: var(--navy);
    font-size: 12pt;
    font-weight: 600;
    margin: 20px 0 6px;
    page-break-after: avoid;
  }
  p { margin: 0 0 10px; }
  strong { color: var(--navy); font-weight: 600; }
  em { color: var(--text); }
  a { color: var(--navy); text-decoration: underline; }
  code {
    font-family: "JetBrains Mono", Menlo, Consolas, monospace;
    background: #f3f4f6;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.9em;
    color: var(--navy);
  }
  pre {
    background: #f9fafb;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    page-break-inside: avoid;
  }
  pre code {
    background: transparent;
    padding: 0;
    font-size: 9.5pt;
  }
  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0;
  }
  ul, ol {
    margin: 0 0 12px;
    padding-left: 22px;
  }
  li { margin-bottom: 4px; }
  blockquote {
    margin: 12px 0;
    padding: 10px 14px;
    border-left: 3px solid var(--gold);
    background: var(--gold-soft);
    color: var(--navy);
    border-radius: 0 4px 4px 0;
    page-break-inside: avoid;
  }
  blockquote p:last-child { margin-bottom: 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0 18px;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 8px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f9fafb;
    color: var(--navy);
    font-weight: 600;
  }
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 12px auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    page-break-inside: avoid;
  }
  /* Tight lead paragraph under h1 */
  h1 + p {
    color: var(--muted);
    font-size: 10.5pt;
    margin-bottom: 18px;
  }
`;

function buildHtml(markdownHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Quick Log — How It Works</title>
    <style>${CSS}</style>
  </head>
  <body>
    <main>${markdownHtml}</main>
  </body>
</html>`;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`📄 Building PDF → ${PDF_PATH}`);

  const md = await readFile(MD_PATH, "utf8");
  // Parse markdown → HTML (sync form returns a string).
  const body = marked.parse(md, { async: false }) as string;
  const html = buildHtml(body);

  // Write a temporary HTML file next to the markdown so image srcs resolve
  // correctly via the file:// base URL (screenshots are relative paths).
  const tmpHtml = join(DOC_DIR, "user-quick-log-guide.__tmp__.html");
  await writeFile(tmpHtml, html, "utf8");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    await page.pdf({
      path: PDF_PATH,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.6in", right: "0.6in" },
    });
  } finally {
    await browser.close();
    // Best-effort cleanup — remove the temporary HTML file completely.
    await unlink(tmpHtml).catch(() => {});
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Wrote ${PDF_PATH}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("❌", err);
  process.exit(1);
});
