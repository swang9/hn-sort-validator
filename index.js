const { chromium } = require("playwright");
const { checkSortOrder } = require("./lib/validate-sort");

async function sortHackerNewsArticles() {
  const headless = process.env.HEADLESS !== "false";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // go to Hacker News newest
    await page.goto("https://news.ycombinator.com/newest");

    const timestamps = [];

    // paginate until we have at least 100 article timestamps
    while (timestamps.length < 100) {
      // HN's title attribute now includes a trailing Unix timestamp:
      // e.g. "2026-03-14T22:04:14 1773525854" — extract only the ISO part
      const pageTimestamps = await page.locator(".age").evaluateAll((els) =>
        els.map((el) => {
          const title = el.getAttribute("title");
          return title ? title.split(" ")[0] : null;
        })
      );

      timestamps.push(...pageTimestamps);

      if (timestamps.length < 100) {
        // guard: if there's no "More" link, the page has fewer than 100 articles
        const moreLink = page.locator("a.morelink");
        if (await moreLink.count() === 0) {
          throw new Error(
            `Pagination link not found — only ${timestamps.length} articles available on /newest`
          );
        }
        await moreLink.click();
        await page.waitForSelector(".athing");
      }
    }

    const first100 = timestamps.slice(0, 100);

    // warn if any articles are missing timestamps — new Date(null) returns epoch
    // and would silently skew the sort check
    const nullCount = first100.filter((ts) => ts === null).length;
    if (nullCount > 0) {
      console.warn(`\nWarning: ${nullCount} article(s) had no timestamp and will be skipped in sort check.\n`);
      process.exitCode = 1;
    }

    console.log(`\nCollected ${first100.length} articles. Validating sort order...\n`);

    // validate sort order using the shared lib — ties allowed, nulls skipped
    const { violations, details } = checkSortOrder(first100);

    for (const { i, current, next } of details) {
      console.error(
        `Sort violation at position ${i + 1} -> ${i + 2}:\n` +
          `  Article ${i + 1}: ${current}\n` +
          `  Article ${i + 2}: ${next} (should not be newer)\n`
      );
    }

    if (violations.size === 0 && nullCount === 0) {
      console.log("PASS: All 100 articles are sorted from newest to oldest.");
    } else {
      if (violations.size > 0) {
        console.log("FAIL: Articles are NOT correctly sorted from newest to oldest.");
      }
      process.exitCode = 1;
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  await sortHackerNewsArticles();
})();
