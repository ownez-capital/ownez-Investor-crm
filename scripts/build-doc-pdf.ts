/**
 * Generic markdown → PDF builder for OwnEZ CRM docs.
 *
 * Usage:
 *   npx tsx scripts/build-doc-pdf.ts --input <md-path> --output <pdf-path> [--title "Page Title"]
 *
 * Examples:
 *   npx tsx scripts/build-doc-pdf.ts \
 *     --input docs/user-quick-log-guide.md \
 *     --output docs/user-quick-log-guide.pdf \
 *     --title "Quick Log — How It Works"
 *
 *   npx tsx scripts/build-doc-pdf.ts \
 *     --input docs/zoho-commitments-integration.md \
 *     --output docs/zoho-commitments-integration.pdf \
 *     --title "Zoho Integration — Commitments Lifecycle"
 *
 * Handles Mermaid fenced code blocks (```mermaid ...```) by routing them
 * through the client-side mermaid.min.js loaded from jsDelivr; Playwright
 * waits for rendering to finish before printing to PDF, so diagrams appear
 * as crisp SVG in the output.
 *
 * Dependency: `marked` (install with `npm install --no-save marked@^14`
 * if not already present). Self-contained otherwise.
 */
import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Marked } from "marked";
import { chromium } from "playwright";

// ─── CLI args ────────────────────────────────────────────────────────────────

function arg(name: string, required = false): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    if (required) {
      console.error(`Missing required --${name} <value>`);
      process.exit(2);
    }
    return undefined;
  }
  return process.argv[idx + 1];
}

const inputPath = arg("input", true)!;
const outputPath = arg("output", true)!;
const title = arg("title") ?? "OwnEZ CRM Doc";

// ─── Shared CSS (OwnEZ design language) ──────────────────────────────────────

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
    max-width: 740px;
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
  h4 {
    color: var(--navy);
    font-size: 11pt;
    font-weight: 600;
    margin: 16px 0 4px;
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
  h1 + p {
    color: var(--muted);
    font-size: 10.5pt;
    margin-bottom: 18px;
  }
  .mermaid {
    display: flex;
    justify-content: center;
    margin: 16px 0;
    page-break-inside: avoid;
  }
  .mermaid svg { max-width: 100%; height: auto; }
`;

// ─── Markdown → HTML with Mermaid passthrough ────────────────────────────────

/**
 * Custom marked instance that emits Mermaid code blocks as <div class="mermaid">
 * containers (which the browser-side mermaid.min.js then renders into SVG)
 * instead of the default <pre><code class="language-mermaid">.
 */
function buildMarked(): Marked {
  const m = new Marked();
  m.use({
    renderer: {
      code(token: { text: string; lang?: string }) {
        const lang = (token.lang || "").trim();
        if (lang === "mermaid") {
          return `<div class="mermaid">${token.text}</div>`;
        }
        // Fall through to default rendering for non-mermaid blocks.
        return false as unknown as string;
      },
    },
  });
  return m;
}

function buildHtml(markdownHtml: string): string {
  // Mermaid renders in the browser; we wait for it to finish before printing.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>${CSS}</style>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        flowchart: { htmlLabels: true, curve: 'basis', padding: 14 },
      });
      (async () => {
        const nodes = document.querySelectorAll('.mermaid');
        for (const el of nodes) {
          const source = el.textContent || '';
          try {
            const id = 'm-' + Math.random().toString(36).slice(2);
            const { svg } = await mermaid.render(id, source);
            el.innerHTML = svg;
          } catch (err) {
            el.innerHTML = '<pre style="color:#c00">Mermaid render error: ' + String(err) + '</pre>';
          }
        }
        // Signal to Playwright that all diagrams are done.
        window.__mermaidReady = true;
      })();
    </script>
  </head>
  <body>
    <main>${markdownHtml}</main>
  </body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`📄 Building PDF`);
  console.log(`  input:  ${inputPath}`);
  console.log(`  output: ${outputPath}`);

  const absInput = resolve(inputPath);
  const absOutput = resolve(outputPath);

  const md = await readFile(absInput, "utf8");
  const m = buildMarked();
  const body = (await m.parse(md)) as string;
  const html = buildHtml(body);

  // Write temp HTML alongside the input file so relative image paths
  // (e.g. screenshots/quick-log-guide/...) resolve correctly.
  const tmpHtml = absInput.replace(/\.md$/i, ".__tmp__.html");
  await writeFile(tmpHtml, html, "utf8");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
    // Wait for Mermaid to finish rendering all diagrams, if any.
    await page.waitForFunction(
      () =>
        (window as unknown as { __mermaidReady?: boolean }).__mermaidReady ===
          true ||
        document.querySelectorAll(".mermaid").length === 0,
      { timeout: 30000 },
    );
    await page.waitForLoadState("networkidle");
    await page.pdf({
      path: absOutput,
      format: "Letter",
      printBackground: true,
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.6in",
        right: "0.6in",
      },
    });
  } finally {
    await browser.close();
    await unlink(tmpHtml).catch(() => {});
  }

  console.log(`✅ Wrote ${absOutput}`);
  // Silence unused import in some refactors.
  void dirname;
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
