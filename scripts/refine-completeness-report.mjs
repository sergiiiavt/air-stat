import fs from 'node:fs';
import assert from 'node:assert/strict';

const IMPACT = /(улам|пошкод|влуч|пожеж|постраж|загин|поран|зруйн|деформац|debris|damage|hit|fire|injur|killed|dead|destroy)/iu;
const BACKGROUND = /(Що передувало|Передісторія|Раніше повідомлялося|Нагадаємо)/iu;
const AREA_PATTERNS = new Map([
  ['Darnytskyi district', /(дарницьк|дарниц[іяі]|darnytsk)/iu],
  ['Desnianskyi district', /(деснянськ|desniansk)/iu],
  ['Dniprovskyi district', /(дніпровськ|dniprovsk)/iu],
  ['Holosiivskyi district', /(голосіївськ|holosiivsk)/iu],
  ['Obolonskyi district', /(оболонськ|obolonsk)/iu],
  ['Pecherskyi district', /(печерськ|pechersk)/iu],
  ['Podilskyi district', /(подільськ|podilsk)/iu],
  ['Shevchenkivskyi district', /(шевченківськ|shevchenkivsk)/iu],
  ['Solomianskyi district', /(солом[’'ʼ]?янськ|solomiansk)/iu],
  ['Sviatoshynskyi district', /(святошинськ|sviatoshynsk)/iu],
  ['Bilotserkivskyi raion', /(білоцерківськ.{0,16}район|bilotserkivskyi raion|bila tserkva raion)/iu],
  ['Boryspilskyi raion', /(бориспільськ.{0,16}район|boryspilskyi raion|boryspil raion)/iu],
  ['Brovarskyi raion', /(броварськ.{0,16}район|brovarskyi raion|brovary raion)/iu],
  ['Buchanskyi raion', /(бучанськ.{0,16}район|buchanskyi raion|bucha raion)/iu],
  ['Fastivskyi raion', /(фастівськ.{0,16}район|fastivskyi raion|fastiv raion)/iu],
  ['Obukhivskyi raion', /(обухівськ.{0,16}район|obukhivskyi raion|obukhiv raion)/iu],
  ['Vyshhorodskyi raion', /(вишгородськ.{0,16}район|vyshhorodskyi raion|vyshhorod raion)/iu],
  ['Bila Tserkva', /(біла церква|bila tserkva)/iu],
  ['Boryspil', /(^|\W)(бориспіль|boryspil)(\W|$)/iu],
  ['Brovary', /(^|\W)(бровари|brovary)(\W|$)/iu],
  ['Bucha', /(^|\W)(буча|bucha)(\W|$)/iu],
  ['Fastiv', /(^|\W)(фастів|fastiv)(\W|$)/iu],
  ['Hostomel', /(гостомел|hostomel)/iu],
  ['Irpin', /(ірпін|irpin)/iu],
  ['Obukhiv', /(^|\W)(обухів|obukhiv)(\W|$)/iu],
  ['Vyshhorod', /(^|\W)(вишгород|vyshhorod)(\W|$)/iu],
  ['Vyshneve', /(вишнев|vyshneve)/iu],
]);

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const v = process.argv[i];
  if (!v.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (!next || next.startsWith('--')) args.set(v.slice(2), 'true');
  else { args.set(v.slice(2), next); i += 1; }
}

const strip = (s) => String(s ?? '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/giu, ' ')
  .replace(/&amp;/giu, '&')
  .replace(/&quot;/giu, '"')
  .replace(/&#39;/giu, "'")
  .replace(/\s+/g, ' ')
  .trim();

function localEvidence(text, area) {
  const re = AREA_PATTERNS.get(area);
  if (!re) return [];
  const primary = text.split(BACKGROUND)[0];
  const clauses = primary.split(/(?<=[.!?])\s+|\s*[;•]\s*/u).map((part) => part.trim()).filter(Boolean);
  const snippets = [];
  for (const clause of clauses) {
    if (!re.test(clause) || !IMPACT.test(clause)) continue;
    snippets.push(clause.length > 620 ? `${clause.slice(0, 617)}...` : clause);
    if (snippets.length >= 3) break;
  }
  return [...new Set(snippets)];
}

async function getText(url) {
  let last;
  for (let i = 0; i < 3; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'air-stat-completeness-refiner/1.0' },
      });
      if (response.ok) return strip(await response.text());
      last = new Error(`HTTP ${response.status} ${url}`);
    } catch (error) { last = error; }
    finally { clearTimeout(timer); }
  }
  throw last ?? new Error(`Unable to fetch ${url}`);
}

function recompute(report) {
  const counts = { verified: 0, review: 0, missing: 0 };
  for (const day of report.days) {
    const hasMissing = day.findings.some((f) => f.severity === 'missing');
    const hasReview = day.findings.some((f) => f.severity === 'review');
    day.status = hasMissing ? 'missing' : hasReview ? 'review' : 'verified';
    counts[day.status] += 1;
  }
  report.missingFindings = report.days.flatMap((d) => d.findings.filter((f) => f.severity === 'missing').map((f) => ({ date: d.date, ...f })));
  report.reviewFindings = report.days.flatMap((d) => d.findings.filter((f) => f.severity === 'review').map((f) => ({ date: d.date, ...f })));
  report.summary = {
    ...counts,
    missingFindings: report.missingFindings.length,
    reviewFindings: report.reviewFindings.length,
  };
  report.refinement = {
    appliedAt: new Date().toISOString(),
    rule: 'Direct-source missing findings require same-clause area + physical-consequence evidence.',
  };
}

function markdown(report) {
  const s = report.summary;
  const lines = [
    '# AirAlert completeness audit', '',
    `Window: **${report.window.from} → ${report.window.to}** (${report.window.days} days)`, '',
    `- Verified: **${s.verified}**`,
    `- Review: **${s.review}**`,
    `- Missing: **${s.missing}**`,
    `- High-confidence missing findings: **${s.missingFindings}**`, '',
    '> Verified means no discrepancy was found by this audit; it is not proof that public reporting is complete.',
  ];
  if (report.missingFindings.length) {
    lines.push('', '## Missing findings');
    for (const f of report.missingFindings.slice(0, 100)) {
      lines.push(`- ${f.date}: ${f.scope ?? 'n/a'} / ${f.area ?? f.kind} — ${f.kind}`);
      if (f.evidenceSnippets?.[0]) lines.push(`  - Evidence: ${f.evidenceSnippets[0]}`);
    }
  }
  if (report.reviewFindings.length) {
    lines.push('', '## Review queue (first 100)');
    for (const f of report.reviewFindings.slice(0, 100)) lines.push(`- ${f.date}: ${f.area ?? f.kind} — ${f.kind}`);
  }
  return `${lines.join('\n')}\n`;
}

function selfTest() {
  const yes = localEvidence('У Деснянському районі уламки БпЛА пошкодили поліклініку. Інші новини.', 'Desnianskyi district');
  assert.equal(yes.length, 1);
  const no = localEvidence('У Деснянському районі оголосили тривогу. В іншій частині міста пошкоджено будинок.', 'Desnianskyi district');
  assert.equal(no.length, 0);
  const background = localEvidence('У Києві пошкоджено будинок. Що передувало: у Солом’янському районі минулого тижня була пожежа.', 'Solomianskyi district');
  assert.equal(background.length, 0);
  console.log('Completeness evidence refinement self-test passed.');
}

async function main() {
  if (args.has('self-test')) return selfTest();
  const reportPath = args.get('report') ?? 'completeness-report.json';
  const summaryPath = args.get('summary') ?? 'completeness-summary.md';
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const cache = new Map();

  for (const day of report.days ?? []) {
    for (const finding of day.findings ?? []) {
      if (finding.kind !== 'external-area-not-in-production' || !finding.area) continue;
      const direct = (finding.examples ?? []).filter((e) => e.publisher === 'Ukrainska Pravda' && /^https:\/\/(?:www\.)?pravda\.com\.ua\//u.test(e.url ?? ''));
      if (!direct.length) continue;
      const evidence = [];
      let fetchFailed = false;
      for (const example of direct.slice(0, 3)) {
        try {
          if (!cache.has(example.url)) cache.set(example.url, await getText(example.url));
          for (const snippet of localEvidence(cache.get(example.url), finding.area)) {
            evidence.push({ url: example.url, snippet });
          }
        } catch { fetchFailed = true; }
      }
      finding.evidenceSnippets = evidence.slice(0, 3).map((e) => e.snippet);
      finding.evidenceUrls = [...new Set(evidence.map((e) => e.url))];
      if (finding.severity === 'missing' && evidence.length === 0) {
        finding.severity = 'review';
        finding.kind = fetchFailed ? 'external-area-evidence-fetch-degraded' : 'external-area-mention-needs-review';
      }
    }
  }

  recompute(report);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(summaryPath, markdown(report));
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
