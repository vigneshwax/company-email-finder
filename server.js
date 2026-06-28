const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_PAGES = 20;
const REQUEST_TIMEOUT = 10000;
const DEFAULT_PATHS = ['/', '/contact', '/contact-us', '/about', '/about-us', '/support', '/help', '/careers', '/jobs', '/team', '/privacy', '/terms'];
const INTERESTING_LINK = /(contact|support|career|job|team|about|help)/i;
const EMAIL_RE = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const FREE_PROVIDERS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com']);

app.use(cors());
app.use(express.json({ limit: '20kb' }));
app.use(express.static(__dirname));
require('./bulk')(app);

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
  }
  return net.isIPv6(ip) && (ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:'));
}

async function validatePublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error('Please enter a valid website URL.'), { status: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Object.assign(new Error('Only public HTTP or HTTPS websites are supported.'), { status: 400 });
  url.hash = '';
  const records = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!records.length) throw Object.assign(new Error('The website domain could not be found.'), { code: 'ENOTFOUND' });
  if (records.some(r => isPrivateIp(r.address))) throw Object.assign(new Error('Private or local network addresses are not allowed.'), { status: 400 });
  return url;
}

async function fetchPage(input, redirects = 0) {
  const url = await validatePublicUrl(input.toString());
  try {
    const response = await axios.get(url.toString(), {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 0,
      responseType: 'text',
      maxContentLength: 3 * 1024 * 1024,
      headers: { 'User-Agent': 'CompanyEmailFinder/1.0 (+website contact discovery)', Accept: 'text/html,application/xhtml+xml' },
      validateStatus: s => s >= 200 && s < 400
    });
    if (response.status >= 300 && response.headers.location) {
      if (redirects >= 5) throw new Error('The website redirected too many times.');
      return fetchPage(new URL(response.headers.location, url), redirects + 1);
    }
    return response;
  } catch (error) {
    if (error.response && error.response.status >= 300 && error.response.status < 400 && error.response.headers.location && redirects < 5) {
      return fetchPage(new URL(error.response.headers.location, url), redirects + 1);
    }
    throw error;
  }
}

function rootDomain(hostname) {
  const parts = hostname.toLowerCase().replace(/^www\./, '').split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : parts.join('.');
}

function classify(email) {
  const local = email.split('@')[0].toLowerCase();
  const rules = [
    ['HR', /(^|[._-])hr($|[._-])|human.?resources/], ['Careers', /career/], ['Recruitment', /recruit/],
    ['Hiring', /hiring|talent/], ['Jobs', /jobs?|vacanc/], ['Support', /support|help|service/],
    ['Sales', /sales|business|bizdev/], ['Contact', /contact|hello/], ['Marketing', /market|press|media|pr/],
    ['Legal', /legal|privacy|compliance/], ['Admin', /admin|office|webmaster/], ['Info', /info|enquir/]
  ];
  return rules.find(([, re]) => re.test(local))?.[0] || 'General';
}

function extractEmails(html) {
  const decoded = html.replace(/&#64;|\[at\]/gi, '@').replace(/&#46;|\[dot\]/gi, '.');
  return (decoded.match(EMAIL_RE) || []).map(e => e.toLowerCase().replace(/[),.;:]+$/, '')).filter(e => e.length <= 254 && !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e));
}

app.post('/api/extract', async (req, res) => {
  try {
    const start = await validatePublicUrl(String(req.body.url || '').trim());
    const includeThirdParty = Boolean(req.body.includeThirdParty);
    const companyRoot = rootDomain(start.hostname);
    const queue = DEFAULT_PATHS.map(p => new URL(p, start.origin).toString());
    const seen = new Set();
    const found = new Set();
    let company = start.hostname.replace(/^www\./, '').split('.')[0];

    while (queue.length && seen.size < MAX_PAGES) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      try {
        const response = await fetchPage(current);
        if (!String(response.headers['content-type'] || '').includes('text/html')) continue;
        const html = String(response.data);
        const $ = cheerio.load(html);
        if (seen.size === 1) company = $('meta[property="og:site_name"]').attr('content') || $('meta[name="application-name"]').attr('content') || $('title').text().split(/[|–—-]/)[0].trim() || company;
        extractEmails(html).forEach(e => found.add(e));
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href || href.startsWith('mailto:')) return;
          try {
            const next = new URL(href, current);
            next.hash = '';
            if (rootDomain(next.hostname) === companyRoot && INTERESTING_LINK.test(next.pathname + $(el).text()) && !seen.has(next.toString()) && queue.length < 60) queue.push(next.toString());
          } catch { /* Ignore malformed links. */ }
        });
      } catch { /* One inaccessible page should not stop the crawl. */ }
    }

    const emails = [...found].map(email => {
      const domain = email.split('@')[1];
      const official = domain === companyRoot || domain.endsWith('.' + companyRoot);
      return { email, department: classify(email), official };
    }).filter(e => includeThirdParty || e.official).sort((a, b) => Number(b.official) - Number(a.official) || a.email.localeCompare(b.email));

    res.json({ company, website: start.origin, rootDomain: companyRoot, pagesCrawled: seen.size, totalEmailsFound: found.size, officialEmailsFound: emails.filter(e => e.official).length, emails });
  } catch (error) {
    let message = error.message || 'Unable to scan this website.';
    if (error.code === 'ECONNABORTED') message = 'The website took too long to respond.';
    else if (['ENOTFOUND', 'EAI_AGAIN'].includes(error.code)) message = 'The website domain could not be found.';
    else if (/certificate|ssl/i.test(message)) message = 'The website has an SSL certificate problem.';
    res.status(error.status || 502).json({ error: message });
  }
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Company Email Finder running at http://localhost:${PORT}`));
