/**
 * Thin wrapper around scripts/build-doc-pdf.ts for the Quick Log guide.
 *
 * Equivalent to:
 *   npx tsx scripts/build-doc-pdf.ts \
 *     --input docs/user-quick-log-guide.md \
 *     --output docs/user-quick-log-guide.pdf \
 *     --title "Quick Log — How It Works"
 *
 * Kept for backwards compatibility with existing commit messages and
 * docs that reference the old script path.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const scriptPath = resolve("scripts/build-doc-pdf.ts");

const child = spawn(
  process.execPath,
  [
    "--import=tsx",
    scriptPath,
    "--input", "docs/user-quick-log-guide.md",
    "--output", "docs/user-quick-log-guide.pdf",
    "--title", "Quick Log — How It Works",
  ],
  { stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
