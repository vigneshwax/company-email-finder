const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const fs = require('node:fs');
const fsp = fs.promises;
const net = require('node:net');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data', 'bulk-jobs');
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
const MAX_URLS = 10000;
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.BULK_CONCURRENCY) || 5));
const PAGE_LIMIT = 7;
const jobs = new Map();
const EMAIL_RE = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s().-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;
const PAGE_WORDS = /(contact|about|support|team|career)/i;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) => cb(null, /\.(xlsx|xls|csv)$/i.test(file.originalname))
});

function privateIp(ip) {
  if (net.isIPv4(ip)) { const p = ip.split('.').map(Number); return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127); }
  return net.isIPv6(ip) && (ip === '::1' || ip === '::' || /^(fc|fd|fe80:)/i.test(ip));
}
async function safeUrl(raw) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe URL');
  const records = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!records.length || records.some(r => privateIp(r.address))) throw new Error('Unsafe or unavailable domain');
  url.hash = ''; return url;
}
async function getHtml(input, redirects = 0) {
  const url = await safeUrl(input.toString());
  const response = await axios.get(url.toString(), { timeout: 12000, maxRedirects: 0, responseType: 'text', maxContentLength: 3e6, headers: { 'User-Agent': 'MailScopeBusinessResearch/1.0', Accept: 'text/html' }, validateStatus: s => s >= 200 && s < 400 });
  if (response.status >= 300 && response.headers.location) {
    if (redirects >= 5) throw new Error('Too many redirects');
    return getHtml(new URL(response.headers.location, url), redirects + 1);
  }
  if (!String(response.headers['content-type'] || '').includes('text/html')) throw new Error('Not an HTML website');
  return { html: String(response.data), url: response.request?.res?.responseUrl || url.toString() };
}
function cleanText(value, max = 500) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function unique(items) { return [...new Set(items.filter(Boolean))]; }
function extractPage(html, pageUrl) {
  const $ = cheerio.load(html); $('script:not([type="application/ld+json"]),style,noscript,svg').remove();
  const text = $.text().replace(/&#64;/gi, '@');
  const emails = unique((html.match(EMAIL_RE) || []).map(x => x.toLowerCase().replace(/[),.;:]+$/, '')).filter(x => !/\.(png|jpe?g|svg|webp|js|css)$/i.test(x)));
  const phones = unique((text.match(PHONE_RE) || []).map(x => cleanText(x, 40)).filter(x => x.replace(/\D/g, '').length >= 7 && x.replace(/\D/g, '').length <= 15));
  const links = [];
  $('a[href]').each((_, a) => { try { links.push({ url: new URL($(a).attr('href'), pageUrl).toString(), text: cleanText($(a).text(), 80) }); } catch {} });
  const social = {};
  for (const link of links) {
    if (/linkedin\.com\/company/i.test(link.url)) social.linkedin ||= link.url;
    if (/facebook\.com/i.test(link.url)) social.facebook ||= link.url;
    if (/instagram\.com/i.test(link.url)) social.instagram ||= link.url;
    if (/(twitter\.com|x\.com)/i.test(link.url)) social.twitter ||= link.url;
  }
  let json = [];
  $('script[type="application/ld+json"]').each((_, el) => { try { const value = JSON.parse($(el).text()); json.push(...(Array.isArray(value) ? value : [value])); } catch {} });
  json = json.flatMap(x => x?.['@graph'] || [x]).filter(Boolean);
  const org = json.find(x => /Organization|Corporation|LocalBusiness/i.test(String(x['@type'] || ''))) || {};
  const address = org.address || {};
  return {
    emails, phones, links, social, name: cleanText(org.name || $('meta[property="og:site_name"]').attr('content') || $('title').text().split(/[|–—-]/)[0], 120),
    industry: cleanText(org.industry || org.knowsAbout || $('meta[name="keywords"]').attr('content'), 150),
    description: cleanText(org.description || $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content'), 320),
    country: cleanText(address.addressCountry, 80), state: cleanText(address.addressRegion, 80), city: cleanText(address.addressLocality, 80)
  };
}
async function respectRobots(origin) {
  try { const r = await axios.get(new URL('/robots.txt', origin).toString(), { timeout: 4000, responseType: 'text', maxContentLength: 200000 }); const groups = String(r.data).split(/user-agent:/i); const applicable = groups.filter(x => /^\s*(\*|MailScopeBusinessResearch)/i.test(x)); return !applicable.some(x => /disallow:\s*\/\s*$/im.test(x)); } catch { return true; }
}
async function crawlWebsite(raw) {
  const start = await safeUrl(raw); const allowed = await respectRobots(start.origin); if (!allowed) throw new Error('Blocked by robots.txt');
  const first = await getHtml(start); const origin = new URL(first.url).origin; const home = extractPage(first.html, first.url);
  const queue = home.links.filter(x => new URL(x.url).origin === origin && PAGE_WORDS.test(x.url + x.text)).map(x => x.url);
  ['/contact', '/contact-us', '/about', '/about-us', '/support', '/team', '/careers'].forEach(p => queue.push(new URL(p, origin).toString()));
  const pages = [{ ...home, pageUrl: first.url }], seen = new Set([first.url]);
  for (const candidate of unique(queue)) {
    if (pages.length >= PAGE_LIMIT) break; let url;
    try { url = await safeUrl(candidate); } catch { continue; }
    if (url.origin !== origin || seen.has(url.toString())) continue; seen.add(url.toString());
    try { const page = await getHtml(url); pages.push({ ...extractPage(page.html, page.url), pageUrl: page.url }); } catch {}
  }
  const emails = unique(pages.flatMap(p => p.emails)); const phones = unique(pages.flatMap(p => p.phones));
  const social = Object.assign({}, ...pages.map(p => p.social)); const details = pages.find(p => p.name || p.description) || home;
  const contactPage = pages.find(p => /contact/i.test(p.pageUrl))?.pageUrl || '';
  return { 'Company Name': details.name, Industry: details.industry, Website: origin, 'Email 1': emails[0] || '', 'Email 2': emails[1] || '', 'Additional Emails': emails.slice(2).join('; '), 'Phone 1': phones[0] || '', 'Phone 2': phones[1] || '', Country: details.country, State: details.state, City: details.city, 'Contact Page': contactPage, LinkedIn: social.linkedin || '', Facebook: social.facebook || '', Instagram: social.instagram || '', 'Twitter/X': social.twitter || '', Description: details.description, Status: emails.length ? 'Success' : 'No Email Found', _emails: emails.length, _phones: phones.length };
}
async function retryCrawl(url) { let error; for (let i = 0; i < 3; i++) { try { return await crawlWebsite(url); } catch (e) { error = e; if (i < 2) await new Promise(r => setTimeout(r, 500 * (i + 1))); } } return { 'Company Name': '', Industry: '', Website: url, 'Email 1': '', 'Email 2': '', 'Additional Emails': '', 'Phone 1': '', 'Phone 2': '', Country: '', State: '', City: '', 'Contact Page': '', LinkedIn: '', Facebook: '', Instagram: '', 'Twitter/X': '', Description: cleanText(error?.message, 250), Status: 'Website Error', _emails: 0, _phones: 0 }; }
function publicJob(job) { const elapsed = job.startedAt ? (Date.now() - job.startedAt) / 1000 : 0; const rate = job.processed ? elapsed / job.processed : 0; return { id: job.id, state: job.state, total: job.urls.length, processed: job.processed, success: job.success, failed: job.failed, emails: job.emails, phones: job.phones, percent: job.urls.length ? Math.round(job.processed / job.urls.length * 100) : 0, remainingSeconds: Math.max(0, Math.round(rate * (job.urls.length - job.processed))), error: job.error || null, outputReady: job.state === 'completed' }; }
async function persist(job) { await fsp.mkdir(DATA_DIR, { recursive: true }); const copy = { ...job }; delete copy.running; await fsp.writeFile(path.join(DATA_DIR, `${job.id}.json`), JSON.stringify(copy)); }
async function worker(job) {
  while (job.state === 'running') {
    const index = job.nextIndex++; if (index >= job.urls.length) break;
    const result = await retryCrawl(job.urls[index]); job.results[index] = result; job.processed++; job.success += result.Status === 'Website Error' ? 0 : 1; job.failed += result.Status === 'Website Error' ? 1 : 0; job.emails += result._emails; job.phones += result._phones;
    if (job.processed % 10 === 0) await persist(job);
  }
}
async function run(job) {
  if (job.running || ['completed', 'cancelled'].includes(job.state)) return; job.running = true; job.state = 'running'; job.startedAt ||= Date.now(); await persist(job);
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(job)));
  job.running = false;
  if (job.processed >= job.urls.length) { job.state = 'completed'; job.completedAt = Date.now(); }
  await persist(job);
  if (job.state === 'running' && job.processed < job.urls.length) setTimeout(() => run(job), 50);
}
function workbookBuffer(rows) {
  const clean = rows.map(({ _emails, _phones, ...r }) => r); const ws = XLSX.utils.json_to_sheet(clean); ws['!autofilter'] = { ref: ws['!ref'] }; ws['!freeze'] = { xSplit: 0, ySplit: 1 }; ws['!cols'] = Object.keys(clean[0] || { Website: '' }).map(k => ({ wch: Math.min(50, Math.max(13, k.length + 2)) })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Business Contacts'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = function registerBulk(app) {
  fsp.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {}); fsp.mkdir(DATA_DIR, { recursive: true }).then(async () => { for (const file of await fsp.readdir(DATA_DIR)) { if (!file.endsWith('.json')) continue; try { const job = JSON.parse(await fsp.readFile(path.join(DATA_DIR, file))); if (job.state === 'running') job.state = 'paused'; jobs.set(job.id, job); } catch {} } });
  app.get('/api/bulk/sample', (_, res) => { const ws = XLSX.utils.aoa_to_sheet([['Website URL'], ['https://example.com'], ['https://openai.com']]); ws['!cols'] = [{ wch: 42 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Websites'); res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="mailscope-input-template.xlsx"' }).send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); });
  app.post('/api/bulk/upload', upload.single('file'), async (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'Choose a valid .xlsx, .xls, or .csv file.' }); const wb = XLSX.readFile(req.file.path); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }); const urls = unique(rows.slice(1).map(r => cleanText(r[0], 2048)).filter(Boolean)); await fsp.unlink(req.file.path).catch(() => {}); if (!urls.length) return res.status(400).json({ error: 'No website URLs were found in the first column.' }); if (urls.length > MAX_URLS) return res.status(400).json({ error: `A maximum of ${MAX_URLS.toLocaleString()} websites is supported per file.` }); const id = crypto.randomUUID(); const job = { id, state: 'ready', urls, results: Array(urls.length), nextIndex: 0, processed: 0, success: 0, failed: 0, emails: 0, phones: 0, createdAt: Date.now() }; jobs.set(id, job); await persist(job); res.json(publicJob(job)); } catch (e) { if (req.file) await fsp.unlink(req.file.path).catch(() => {}); res.status(400).json({ error: 'The spreadsheet could not be read. Check its format and first-column header.' }); } });
  app.post('/api/bulk/:id/start', (req, res) => { const job = jobs.get(req.params.id); if (!job) return res.status(404).json({ error: 'Job not found.' }); if (job.state === 'paused' || job.state === 'ready') { job.state = 'running'; run(job).catch(e => { job.state = 'error'; job.error = e.message; persist(job); }); } res.json(publicJob(job)); });
  app.post('/api/bulk/:id/pause', async (req, res) => { const job = jobs.get(req.params.id); if (!job) return res.status(404).json({ error: 'Job not found.' }); if (job.state === 'running') job.state = 'paused'; await persist(job); res.json(publicJob(job)); });
  app.post('/api/bulk/:id/resume', (req, res) => { const job = jobs.get(req.params.id); if (!job) return res.status(404).json({ error: 'Job not found.' }); if (job.state === 'paused') { job.state = 'running'; setTimeout(() => run(job), 50); } res.json(publicJob(job)); });
  app.post('/api/bulk/:id/cancel', async (req, res) => { const job = jobs.get(req.params.id); if (!job) return res.status(404).json({ error: 'Job not found.' }); job.state = 'cancelled'; await persist(job); res.json(publicJob(job)); });
  app.get('/api/bulk/:id/status', (req, res) => { const job = jobs.get(req.params.id); if (!job) return res.status(404).json({ error: 'Job not found.' }); res.json(publicJob(job)); });
  app.get('/api/bulk/:id/download', (req, res) => { const job = jobs.get(req.params.id); if (!job || job.state !== 'completed') return res.status(409).json({ error: 'The report is not ready yet.' }); res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="mailscope-bulk-report-${job.id.slice(0, 8)}.xlsx"` }).send(workbookBuffer(job.results)); });
};
