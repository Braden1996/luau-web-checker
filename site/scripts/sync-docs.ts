// Copies the repository's CHANGELOG.md and CONTRIBUTING.md into the site's content as Starlight pages, so each has one
// source. The first `# ` heading becomes the page title; relative links point at GitHub. The outputs are gitignored.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface Document {
  readonly source: string;
  readonly slug: string;
  readonly description: string;
}

const DOCUMENTS: readonly Document[] = [
  {
    source: "CONTRIBUTING.md",
    slug: "contributing",
    description: "Setup, layout, tests and releases.",
  },
  { source: "CHANGELOG.md", slug: "changelog", description: "Every notable change, by version." },
];

const REPOSITORY = "https://github.com/Braden1996/luau-web-checker/blob/main";
const root = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const output = fileURLToPath(new URL("../src/content/docs/project/", import.meta.url));

function rewriteLinks(markdown: string): string {
  return markdown.replaceAll(
    /\]\((?!https?:|#|mailto:)([^)#]+)(#[^)]*)?\)/gu,
    (_match, target: string, hash = "") => `](${REPOSITORY}/${target}${String(hash)})`,
  );
}

mkdirSync(output, { recursive: true });
for (const document of DOCUMENTS) {
  const text = readFileSync(root(document.source), "utf8").replaceAll("\r\n", "\n");
  const heading = /^# (.+)\n+/u.exec(text);
  const body = heading ? text.slice(heading[0].length) : text;
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(heading?.[1] ?? document.slug)}`,
    `description: ${JSON.stringify(document.description)}`,
    `editUrl: ${JSON.stringify(`${REPOSITORY.replace("/blob/", "/edit/")}/${document.source}`)}`,
    "---",
    "",
    `<!-- Generated from ${document.source} by site/scripts/sync-docs.ts; edit that file instead. -->`,
    "",
  ].join("\n");
  writeFileSync(`${output}${document.slug}.md`, frontmatter + rewriteLinks(body));
}
console.log(`synced ${String(DOCUMENTS.length)} documents into src/content/docs/project/`);
