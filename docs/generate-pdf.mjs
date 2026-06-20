import { readFileSync, writeFileSync } from "fs";
import { marked } from "marked";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(__dirname, "codebase-refactoring-report.md");
const htmlPath = path.join(__dirname, "codebase-refactoring-report.html");
const pdfPath = path.join(__dirname, "codebase-refactoring-report.pdf");

const md = readFileSync(mdPath, "utf8");
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Instant-Attorney Codebase Refactoring Report</title>
  <style>
    @page { margin: 0.75in; size: letter; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #1a1a1a;
      max-width: 7.5in;
      margin: 0 auto;
      padding: 0.25in 0;
    }
    h1 {
      font-size: 22pt;
      font-weight: 700;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 0.3em;
      margin-top: 0;
      page-break-after: avoid;
    }
    h2 {
      font-size: 15pt;
      font-weight: 700;
      color: #1e3a5f;
      margin-top: 1.6em;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 0.2em;
      page-break-after: avoid;
    }
    h3 {
      font-size: 12pt;
      font-weight: 600;
      color: #334155;
      margin-top: 1.2em;
      page-break-after: avoid;
    }
    h4 {
      font-size: 11pt;
      font-weight: 600;
      margin-top: 1em;
      page-break-after: avoid;
    }
    p { margin: 0.6em 0; }
    strong { font-weight: 600; }
    a { color: #2563eb; text-decoration: none; }
    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 1.5em 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 0.45em 0.6em;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    code {
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 9pt;
      background: #f1f5f9;
      padding: 0.1em 0.35em;
      border-radius: 3px;
    }
    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 0.9em 1em;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 8.5pt;
      line-height: 1.45;
      page-break-inside: avoid;
      white-space: pre-wrap;
      word-break: break-word;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      font-size: inherit;
    }
    ul, ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }
    li { margin: 0.25em 0; }
    blockquote {
      border-left: 3px solid #94a3b8;
      margin: 1em 0;
      padding: 0.2em 0 0.2em 1em;
      color: #475569;
    }
    .meta {
      color: #64748b;
      font-size: 10pt;
      margin-bottom: 1.5em;
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;

writeFileSync(htmlPath, html);

const chromeCandidates = [
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const chrome = chromeCandidates.find((p) => {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
});

if (!chrome) {
  console.error("Chrome/Chromium not found for PDF generation.");
  process.exit(1);
}

const tmpProfile = path.join(__dirname, ".chrome-pdf-profile");
execFileSync(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--no-pdf-header-footer",
  `--user-data-dir=${tmpProfile}`,
  "--run-all-compositor-stages-before-draw",
  "--virtual-time-budget=10000",
  `--print-to-pdf=${pdfPath}`,
  `file://${htmlPath}`,
], { stdio: "inherit" });

console.log(`PDF written to ${pdfPath}`);
