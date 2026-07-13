const puppeteer = require("puppeteer");
const { URL } = require("url");
const { extractEmails, extractMailtoEmails } = require("./emailExtractor");

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });
  }
  return browserPromise;
}

// Pages likely to contain contact info get crawled first.
const PRIORITY_KEYWORDS = [
  "contact", "about", "team", "support", "career", "careers",
  "staff", "people", "reach", "connect", "help", "info"
];

function normalizeUrl(rawUrl) {
  let u = (rawUrl || "").trim();
  if (!u) throw new Error("Empty URL");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function isSameDomain(link, baseHost) {
  try {
    const l = new URL(link);
    const strip = (h) => h.replace(/^www\./, "");
    return strip(l.hostname) === strip(baseHost) && /^https?:$/.test(l.protocol);
  } catch {
    return false;
  }
}

async function getPageData(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
  );
  await page.setDefaultNavigationTimeout(20000);
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    const html = await page.content();
    const links = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
    await page.close();
    return { html, links };
  } catch (err) {
    await page.close().catch(() => {});
    throw err;
  }
}

/**
 * Crawl a website (homepage + a limited number of internal pages) and
 * collect every email address found.
 *
 * @param {string} rawUrl
 * @param {object} opts
 * @param {number} opts.maxPages - max number of pages to visit per site
 * @param {function} opts.onProgress - callback(pageUrl, emailsSoFar)
 */
async function crawlWebsite(rawUrl, { maxPages = 6, onProgress } = {}) {
  const startUrl = normalizeUrl(rawUrl);
  const browser = await getBrowser();
  const host = new URL(startUrl).hostname;

  const visited = new Set();
  const emailsFound = new Set();
  const pagesToVisit = [startUrl];
  const errors = [];
  let pagesVisited = 0;

  while (pagesToVisit.length && pagesVisited < maxPages) {
    const current = pagesToVisit.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    try {
      const { html, links } = await getPageData(browser, current);
      pagesVisited++;

      extractEmails(html).forEach((e) => emailsFound.add(e));
      extractMailtoEmails(html).forEach((e) => emailsFound.add(e));

      if (onProgress) {
        onProgress({ page: current, emailsSoFar: emailsFound.size, pagesVisited });
      }

      const internal = links.filter((l) => isSameDomain(l, host) && !visited.has(l));
      const prioritized = internal.filter((l) =>
        PRIORITY_KEYWORDS.some((k) => l.toLowerCase().includes(k))
      );
      const rest = internal.filter((l) => !prioritized.includes(l));

      [...prioritized, ...rest].forEach((l) => {
        const clean = l.split("#")[0];
        if (!visited.has(clean) && !pagesToVisit.includes(clean)) {
          pagesToVisit.push(clean);
        }
      });
    } catch (err) {
      errors.push({ page: current, error: err.message });
    }
  }

  return {
    url: startUrl,
    emails: [...emailsFound],
    pagesVisited,
    errors
  };
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

module.exports = { crawlWebsite, normalizeUrl, closeBrowser };
