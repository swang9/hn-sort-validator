const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { checkSortOrder } = require("../lib/validate-sort");

test("first 100 HN articles are sorted newest to oldest", async ({ page }) => {
  const startTime = Date.now();

  await page.goto("https://news.ycombinator.com/newest");

  const articles = [];

  // paginate until we have at least 100 articles
  while (articles.length < 100) {
    const pageArticles = await page.locator(".athing").evaluateAll((rows) =>
      rows.map((row) => {
        const rankEl = row.querySelector(".rank");
        const titleEl = row.querySelector(".titleline > a");
        const ageEl = row.nextElementSibling?.querySelector(".age");
        // HN's title attribute now includes a trailing Unix timestamp:
        // e.g. "2026-03-14T22:04:14 1773525854" — extract only the ISO part
        const rawTitle = ageEl ? ageEl.getAttribute("title") : null;
        return {
          rank: rankEl ? parseInt(rankEl.textContent) : null,
          title: titleEl ? titleEl.textContent.trim() : "(no title)",
          href: titleEl ? titleEl.href : null,
          timestamp: rawTitle ? rawTitle.split(" ")[0] : null,
        };
      })
    );

    articles.push(...pageArticles);

    if (articles.length < 100) {
      // guard: if there's no "More" link, the page has fewer than 100 articles
      const moreLink = page.locator("a.morelink");
      if (await moreLink.count() === 0) {
        throw new Error(
          `Pagination link not found — only ${articles.length} articles available on /newest`
        );
      }
      await moreLink.click();
      await page.waitForSelector(".athing");
    }
  }

  const first100 = articles.slice(0, 100);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // --- sort validation ---
  // ties (same second) are allowed — only strict "older before newer" is a violation
  const { violations } = checkSortOrder(first100.map((a) => a.timestamp));

  // --- derived data for report & assertions ---
  const nullTimestamps = first100.filter((a) => !a.timestamp);

  const invalidTimestamps = first100.filter(
    (a) => a.timestamp && isNaN(new Date(a.timestamp).getTime())
  );

  const missingTitles = first100.filter((a) => a.title === "(no title)");

  const hrefs = first100.map((a) => a.href).filter(Boolean);
  const uniqueHrefs = new Set(hrefs);
  const duplicateCount = hrefs.length - uniqueHrefs.size;

  const ranks = first100.map((a) => a.rank);
  const expectedRanks = Array.from({ length: 100 }, (_, i) => i + 1);

  // time span: difference between newest (first) and oldest (last) valid timestamps
  const timeSpan = computeTimeSpan(first100[0]?.timestamp, first100[99]?.timestamp);

  // compute overall pass/fail upfront — covers every assertion so the report
  // badge always matches what Playwright reports
  const allPassed =
    ranks.every((r, i) => r === i + 1) &&
    duplicateCount === 0 &&
    missingTitles.length === 0 &&
    invalidTimestamps.length === 0 &&
    nullTimestamps.length === 0 &&
    violations.size === 0;

  // write the HTML + JSON reports regardless of pass/fail
  writeReport(first100, violations, elapsed, nullTimestamps.length, timeSpan, allPassed);

  // --- assertions ---
  // 1. exactly 100 articles collected
  expect(first100).toHaveLength(100);

  // 2. ranks are sequential 1–100 with no gaps or duplicates
  expect(ranks, "Article ranks are not sequential 1–100").toEqual(expectedRanks);

  // 3. no duplicate article URLs
  expect(
    duplicateCount,
    `Found ${duplicateCount} duplicate article URL(s)`
  ).toBe(0);

  // 4. all articles have titles
  expect(
    missingTitles.length,
    `${missingTitles.length} article(s) had no title`
  ).toBe(0);

  // 5. no unparseable timestamps (garbage strings that are non-null but invalid)
  expect(
    invalidTimestamps.length,
    `${invalidTimestamps.length} article(s) had unparseable timestamps`
  ).toBe(0);

  // 6. no missing timestamps
  expect(
    nullTimestamps.length,
    `${nullTimestamps.length} article(s) were missing timestamps entirely`
  ).toBe(0);

  // 7. sort order — saved for last so all structural checks run first
  expect(
    violations.size,
    `Sort violations found at article positions: ${[...violations].map((i) => i + 1).join(", ")}`
  ).toBe(0);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes a human-readable time span between two ISO timestamps.
 * Returns "N/A" if either timestamp is missing or invalid.
 */
function computeTimeSpan(ts1, ts2) {
  if (!ts1 || !ts2) return "N/A";
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  if (isNaN(d1) || isNaN(d2)) return "N/A";

  const diffMs = Math.abs(d1 - d2);
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Writes report.html and report.json to the project root.
 * Called before assertions so the report is always written even on failure.
 */
function writeReport(articles, violations, elapsed, nullCount = 0, timeSpan = "N/A", passed = false) {
  const runTime = new Date().toLocaleString();

  const rows = articles
    .map((a, i) => {
      const isNull = !a.timestamp;
      const isViolation = violations.has(i);
      // null rows get their own "warn" state — they weren't verified, not confirmed passing
      const statusIcon = isNull ? "?" : isViolation ? "✗" : "✓";
      const rowClass = isNull ? "warn" : isViolation ? "fail" : "pass";
      const titleCell = a.href
        ? `<a href="${escapeHtml(a.href)}" target="_blank">${escapeHtml(a.title)}</a>`
        : escapeHtml(a.title);
      return `
      <tr class="${rowClass}">
        <td>${a.rank ?? i + 1}</td>
        <td class="title-cell">${titleCell}</td>
        <td class="ts">${a.timestamp ?? "—"}</td>
        <td class="status">${statusIcon}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HN Sort Validation Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; color: #1a1a1a; }
    header { background: #ff6600; color: white; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 1.4rem; font-weight: 700; }
    header p { font-size: 0.85rem; opacity: 0.85; margin-top: 4px; }
    .badge { padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 1rem; background: white; }
    .badge.pass { color: #16a34a; }
    .badge.fail { color: #dc2626; }
    .summary { display: flex; gap: 24px; padding: 20px 32px; background: white; border-bottom: 1px solid #e5e5e5; flex-wrap: wrap; }
    .stat { text-align: center; min-width: 80px; }
    .stat .value { font-size: 1.8rem; font-weight: 700; }
    .stat .label { font-size: 0.75rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat.violations .value { color: ${violations.size > 0 ? "#dc2626" : "#16a34a"}; }
    .stat.missing .value { color: ${nullCount > 0 ? "#d97706" : "#16a34a"}; }
    .table-wrap { padding: 24px 32px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #1a1a1a; color: white; padding: 12px 16px; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; font-size: 0.875rem; }
    tr:last-child td { border-bottom: none; }
    tr.pass { background: #f0fdf4; }
    tr.fail { background: #fef2f2; }
    tr.warn { background: #fffbeb; }
    .title-cell { max-width: 520px; }
    .title-cell a { color: #1d4ed8; text-decoration: none; }
    .title-cell a:hover { text-decoration: underline; }
    .ts { color: #555; font-size: 0.8rem; white-space: nowrap; }
    .status { font-size: 1.1rem; text-align: center; }
    tr.pass .status { color: #16a34a; }
    tr.fail .status { color: #dc2626; }
    tr.warn .status { color: #d97706; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Hacker News Sort Order Validation</h1>
      <p>Run at ${runTime} &nbsp;·&nbsp; ${elapsed}s elapsed</p>
    </div>
    <span class="badge ${passed ? "pass" : "fail"}">${passed ? "PASS" : "FAIL"}</span>
  </header>
  <div class="summary">
    <div class="stat">
      <div class="value">100</div>
      <div class="label">Articles Checked</div>
    </div>
    <div class="stat violations">
      <div class="value">${violations.size}</div>
      <div class="label">Sort Violations</div>
    </div>
    <div class="stat missing">
      <div class="value">${nullCount}</div>
      <div class="label">Missing Timestamps</div>
    </div>
    <div class="stat">
      <div class="value">${timeSpan}</div>
      <div class="label">Time Span</div>
    </div>
    <div class="stat">
      <div class="value">${elapsed}s</div>
      <div class="label">Elapsed</div>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Title</th>
          <th>Timestamp</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body>
</html>`;

  const reportDir = path.join(__dirname, "..");

  // HTML report
  const htmlPath = path.join(reportDir, "report.html");
  fs.writeFileSync(htmlPath, html, "utf8");

  // JSON report — machine-consumable output for CI pipelines and downstream tooling
  const jsonPath = path.join(reportDir, "report.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        passed,
        elapsed: parseFloat(elapsed),
        timeSpan,
        summary: {
          articlesChecked: articles.length,
          sortViolations: violations.size,
          missingTimestamps: nullCount,
        },
        articles: articles.map((a, i) => ({
          rank: a.rank,
          title: a.title,
          href: a.href,
          timestamp: a.timestamp,
          // explicit status per article so consumers don't need to re-derive it
          status: !a.timestamp ? "skipped" : violations.has(i) ? "violation" : "pass",
        })),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nReports written to:\n  ${htmlPath}\n  ${jsonPath}\n`);
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
