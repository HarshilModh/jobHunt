#!/usr/bin/env node
// Turns people-grabber.js into an installable `javascript:` bookmarklet
// and writes the install guide. Run after editing the grabber source:
//   node make-bookmarklet.mjs

import { readFileSync, writeFileSync } from 'fs';

const src = readFileSync('people-grabber.js', 'utf-8');

// Light minify: strip // line comments and collapse blank lines. (Block-safe:
// the source uses only // comments, no regex literals that contain "//".)
const min = src
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .filter((l) => l.trim() !== '')
  .join('\n');

const bookmarklet = 'javascript:' + encodeURIComponent(min);

const guide = `# LinkedIn People Grabber — install & use

A bookmarklet that copies the people from a LinkedIn search page **you are
viewing** into a clean table (Name, Headline, Profile URL). Safe: it runs only
in your browser, only when you click it, only on the page already on screen. No
auto-paging, no messaging, no API calls, no headless scraping.

## Install (once, ~1 minute)

1. Show your browser's bookmarks bar (Chrome/Edge: ⇧⌘B · Safari: ⇧⌘B).
2. Right-click the bookmarks bar → **Add Page** / **Add Bookmark**.
3. **Name:** \`Grab People\`
4. **URL:** paste the entire line from \`bookmarklet.txt\` (starts with \`javascript:\`).
5. Save.

## Use

1. On LinkedIn, run a **People** search — e.g. open a link from
   \`data/referral-targets.md\`, or search \`NVIDIA Stevens Institute of Technology\`
   and click the **People** tab.
2. Scroll down so all 10 results on the page load.
3. Click the **Grab People** bookmark. It copies everyone to your clipboard.
4. Paste into a spreadsheet, or into \`data/referral-targets-people.md\`.
5. Pick who to message, open their profile, send your note manually
   (drafts are in \`data/referral-targets.md\`).
6. Log who you contacted in \`data/referrals.md\` so \`--followups\` can remind you.

Tip: LinkedIn shows ~10 people per page. Click **Next** at the bottom and run
the bookmark again on each page — a handful of pages covers most companies.

## If it ever stops working

LinkedIn changes its page structure occasionally, which can break the selectors.
Tell Claude "the people grabber stopped working" and it'll refresh
\`people-grabber.js\` and rebuild the bookmarklet.

⚠️ Keep it light and human-paced. This is a copy helper for pages you're
already reading — not a crawler. Don't click it hundreds of times in a row.
`;

writeFileSync('bookmarklet.txt', bookmarklet + '\n', 'utf-8');
writeFileSync('people-grabber.md', guide, 'utf-8');

console.log(`✓ bookmarklet.txt written (${bookmarklet.length} chars)`);
console.log(`✓ people-grabber.md written (install guide)`);
