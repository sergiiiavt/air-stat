import { readFileSync } from 'node:fs';
import { decodeTelegramHtml, oldestTelegramPostNumber, parseTelegramFeed } from '../shared/telegram-feed.mjs';

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Minimal fixture in the public t.me/s/<channel> markup. Texts mirror official
// posts of 21 Nov 2026 (KMVA 22858; Klitschko 8206) that production missed
// because only Google News redirect pages reached the extractor.
const fixture = `
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="VA_Kyiv/22858">
  <div class="tgme_widget_message_text js-message_text" dir="auto">У Подільському районі внаслідок ворожої атаки сталося загоряння двох приватних житлових будинків.</div>
  <a class="tgme_widget_message_date"><time datetime="2026-11-21T04:33:10+00:00" class="time">06:33</time></a>
</div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="vitaliy_klitschko/8206">
  <div class="tgme_widget_message_text js-message_text" dir="auto">Двоє постраждалих у столиці.<br/>Вранці в Києві в Подільському районі, внаслідок падіння уламків, сталося загоряння приватного житлового будинку.<br/><br/>У Соломʼянському районі уламки впали на відкритій території. Без загоряння. &amp; &#39;test&#39;</div>
  <a class="tgme_widget_message_date"><time datetime="2026-11-21T06:50:00+00:00" class="time">08:50</time></a>
</div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="VA_Kyiv/22857">
  <div class="tgme_widget_message_photo_wrap"></div>
  <a class="tgme_widget_message_date"><time datetime="2026-11-21T04:00:00+00:00" class="time">06:00</time></a>
</div></div>
`;

const posts = parseTelegramFeed(fixture);
assertEqual(posts.map((post) => post.url), [
  'https://t.me/VA_Kyiv/22858',
  'https://t.me/vitaliy_klitschko/8206',
], 'media-only posts are skipped and posts are ordered oldest first');
assertEqual(posts[0].channel, 'VA_Kyiv', 'channel parsed');
assertEqual(posts[0].number, 22858, 'post number parsed');
assertEqual(posts[0].time, '2026-11-21T04:33:10.000Z', 'timestamp normalized to ISO');
if (!posts[1].text.includes('Соломʼянському районі')) throw new Error('district text must survive decoding');
if (!posts[1].text.includes("& 'test'")) throw new Error('HTML entities must be decoded');
if (!posts[1].text.includes('\n')) throw new Error('<br> must become a line break');
assertEqual(oldestTelegramPostNumber(posts), 8206, 'oldest post number for pagination');
assertEqual(decodeTelegramHtml('<b>Київ</b>&nbsp;—&#x2014;'), 'Київ ——', 'tag stripping and entity decoding');

// Source contracts for the recent-research fixes of 22 Nov 2026.
const research = readFileSync(new URL('../worker/automated-research.ts', import.meta.url), 'utf8');
const hydrateStart = research.indexOf('async function hydrateCandidate(');
const hydrateFetch = research.indexOf('await fetchWithTimeout(url.toString()', hydrateStart);
const googleGuard = research.indexOf('news\\.google\\.com', hydrateStart);
if (hydrateStart < 0 || hydrateFetch < 0 || googleGuard < 0 || googleGuard > hydrateFetch) {
  throw new Error('hydrateCandidate must return Google News RSS links before fetching them');
}
for (const required of [
  "KYIV_OFFICIAL_TELEGRAM_CHANNELS = ['VA_Kyiv', 'vitaliy_klitschko']",
  'fetchKyivOfficialTelegram(from, to, perSourceLimit, maxTextChars)',
  'kyivTelegramCandidates,',
]) {
  if (!research.includes(required)) throw new Error(`automated-research.ts no longer contains ${required}`);
}
if (/TELEGRAM_FEED_ENDPOINT[^\n]*\?q=/.test(research)) {
  throw new Error('Official Telegram discovery must read the plain feed, not Telegram search');
}

console.log(`Validated Telegram feed parsing (${posts.length} posts) and recent-research source contracts.`);
