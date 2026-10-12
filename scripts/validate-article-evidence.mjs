import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pravdaArticleEvidence } from '../shared/article-evidence.mjs';

const title = 'Реактивні дрони атакували Київ: у Деснянському районі пошкоджена поліклініка';
const htmlText = [
  'Новини Головне УП. Ранок',
  title,
  'Вдень 12 серпня у Деснянському районі пошкоджено поліклініку.',
  'У Дарницькому районі пошкоджена нежитлова будівля.',
  'Шановні читачі, просимо дотримуватись Правил коментування',
  'Головне сьогодні У Солом’янському районі дрон влучив у магазин: постраждалі.',
].join(' ');
const evidence = pravdaArticleEvidence(htmlText, title);
assert.match(evidence, /Деснянському районі/);
assert.match(evidence, /Дарницькому районі/);
assert.doesNotMatch(evidence, /Солом’янському районі/, 'Related stories must not become incident evidence');
assert.equal(pravdaArticleEvidence('Site navigation unrelated news',title), title,
  'Unavailable article body must not create unsupported incidents');
assert.equal(pravdaArticleEvidence(htmlText,''), '');
assert.match(pravdaArticleEvidence(htmlText, 'оновлено ' + title), /Деснянському районі/,
  'Archived updated-tag headlines must still match the real article title');
assert.equal(pravdaArticleEvidence(title + ' У Києві пошкоджено будинок. Головне сьогодні Раніше інша атака',title),
  title + ' У Києві пошкоджено будинок.');

const worker = readFileSync(new URL('../worker/automated-research.ts', import.meta.url), 'utf8');
const audit = readFileSync(new URL('./audit-production-completeness.mjs', import.meta.url), 'utf8');
const refine = readFileSync(new URL('./refine-completeness-report.mjs', import.meta.url), 'utf8');
assert.match(worker, /pravdaArticleEvidence\(/, 'Recent collection must isolate article text');
assert.match(audit, /pravdaArticleEvidence\(/, 'Independent audit must exclude recommendations');
assert.match(refine, /pravdaArticleEvidence\(/, 'Audit refinement must exclude recommendations');
console.log('Article evidence boundary regression checks passed.');
