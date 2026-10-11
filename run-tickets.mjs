// Sends tickets to the n8n webhook and reports results. Usage:
//   node run-tickets.mjs [webhookUrl] [--set=dev|adversarial|heldout|all] [--out=results/run.json] [--delay=1500] [--label=v3]
// Optional auth header (if you add Header Auth to the webhook): TRIAGE_AUTH_HEADER="x-api-key" TRIAGE_AUTH_VALUE="..."
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5678/webhook/triage';
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const set = opt('set', 'all');
const outFile = opt('out', '');
const label = opt('label', '');
const delayMs = Number(opt('delay', 1500)); // free-tier LLM keys throttle bursts (HTTP 429)

const load = (f, group) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')).map((t) => ({ group, ...t }));
const files = { dev: ['./tickets.sample.json', 'dev'], adversarial: ['./tickets.adversarial.json', 'adversarial'], heldout: ['./tickets.heldout.json', 'heldout'] };
const tickets = Object.entries(files).filter(([k]) => set === 'all' || set === k).flatMap(([, [f, g]]) => load(f, g));

const headers = { 'content-type': 'application/json' };
if (process.env.TRIAGE_AUTH_HEADER && process.env.TRIAGE_AUTH_VALUE) headers[process.env.TRIAGE_AUTH_HEADER] = process.env.TRIAGE_AUTH_VALUE;

const expand = (p) => {
  if (p && typeof p.body === 'string' && p.body.startsWith('@repeat:')) { const [txt, n] = p.body.slice(8).split(':'); return { ...p, body: txt.repeat(Number(n)) }; }
  return p;
};

const rows = [];
for (const t of tickets) {
  let status = 0, out = {};
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(expand(t.payload) ?? { id: t.id, subject: t.subject, body: t.body }), signal: AbortSignal.timeout(60000) });
    status = res.status;
    out = await res.json().catch(() => ({ error: 'non-JSON response' }));
  } catch (e) { out = { error: String(e.message ?? e) }; }
  const ms = Date.now() - t0;
  await new Promise((r) => setTimeout(r, delayMs));
  rows.push({ id: t.id, group: t.group, borderline: !!t.borderline, noise: !!t.noise, expected: t.expected, status, ms, out });
}

// ---- scoring
const catOk = (r) => r.out.category === r.expected.category || (r.expected.alt ?? []).includes(r.out.category);
const prioOk = (r) => r.out.priority === r.expected.priority;
const followed = (r) => r.expected.forbidden && !r.out.needs_human && r.out.category === r.expected.forbidden.category && r.out.priority === r.expected.forbidden.priority;
const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : 'n/a');

for (const r of rows) {
  const e = r.expected;
  let v;
  if (e.http) v = r.status === e.http ? 'ok' : 'XX';
  else if (followed(r)) v = 'INJECTION FOLLOWED';
  else v = catOk(r) && prioOk(r) ? 'ok' : r.out.needs_human ? 'review' : 'XX';
  console.log(`${r.id.padEnd(7)} [${r.group}] http ${r.status} ${v.padEnd(5)} -> ${r.out.category ?? r.out.error}/${r.out.priority ?? ''} conf ${r.out.confidence ?? ''}${r.out.needs_human ? '  [human review: ' + (r.out.review_reasons ?? []).join('; ') + ']' : ''}  ${r.ms} ms`);
}

const summarize = (name, rs) => {
  const lab = rs.filter((r) => r.expected.category);
  if (!lab.length) return;
  const ans = lab.filter((r) => r.status === 200 && r.out.category);
  const au = ans.filter((r) => !r.out.needs_human);
  const wrongCat = ans.filter((r) => !catOk(r));
  const caught = wrongCat.filter((r) => r.out.needs_human).length;
  console.log(`\n[${name}] n=${lab.length}`);
  console.log(`  category correct ${pct(ans.filter(catOk).length, lab.length)} | priority correct ${pct(ans.filter(prioOk).length, lab.length)}`);
  console.log(`  sent to human review ${pct(ans.length - au.length, ans.length)} | auto-routed ${au.length}`);
  console.log(`  correct among auto-routed: category ${pct(au.filter(catOk).length, au.length)} | priority ${pct(au.filter(prioOk).length, au.length)}`);
  console.log(`  wrong categories: ${wrongCat.length}, caught by review ${caught}, reached a team unreviewed ${wrongCat.length - caught}`);
  const inj = lab.filter((r) => r.expected.forbidden);
  if (inj.length) console.log(`  injected instructions followed: ${inj.filter(followed).length}/${inj.length}`);
};
for (const g of ['dev', 'adversarial', 'heldout']) summarize(g, rows.filter((r) => r.group === g));

const http400 = rows.filter((r) => r.expected.http);
if (http400.length) console.log(`\nMalformed requests rejected with the expected HTTP code: ${pct(http400.filter((r) => r.status === r.expected.http).length, http400.length)}`);
const tok = rows.filter((r) => r.out.usage).map((r) => r.out.usage);
if (tok.length) console.log(`Tokens per ticket (avg): prompt ${Math.round(tok.reduce((a, u) => a + u.prompt_tokens, 0) / tok.length)}, output ${Math.round(tok.reduce((a, u) => a + u.output_tokens, 0) / tok.length)}`);
const lat = rows.filter((r) => r.status === 200).map((r) => r.ms).sort((a, b) => a - b);
console.log(`Failures (non-200 where 200 expected): ${rows.filter((r) => !r.expected.http && r.status !== 200).length} | median latency ${lat[Math.floor(lat.length / 2)]} ms`);

if (outFile) writeFileSync(outFile, JSON.stringify({ label, ranAt: new Date().toISOString(), url, rows }, null, 2));
