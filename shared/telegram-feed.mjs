// Parser for public Telegram channel feeds (https://t.me/s/<channel>).
//
// Used for official Kyiv City channels in recent research: their posts carry
// district-level consequence details in the post body itself, so no publisher
// page has to be hydrated. Only the plain feed is read (never Telegram search).

const ENTITY_MAP = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

export function decodeTelegramHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP[name.toLowerCase()] ?? match)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Returns posts oldest-first: { channel, number, time (ISO), text, url }.
// Posts without text (pure media/service messages) or without a parseable
// timestamp are skipped.
export function parseTelegramFeed(html) {
  const posts = [];
  const chunks = String(html ?? '').split(/data-post="/i).slice(1);

  for (const chunk of chunks) {
    const id = chunk.split('"', 1)[0];
    const idMatch = id.match(/^([A-Za-z0-9_]+)\/(\d+)$/);
    if (!idMatch) continue;
    const timeMatch = chunk.match(/<time[^>]*datetime="([^"]+)"/i);
    const textMatch = chunk.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!timeMatch || !textMatch) continue;

    const parsed = new Date(timeMatch[1]);
    if (Number.isNaN(parsed.getTime())) continue;
    const text = decodeTelegramHtml(textMatch[1]);
    if (!text) continue;

    posts.push({
      channel: idMatch[1],
      number: Number(idMatch[2]),
      time: parsed.toISOString(),
      text,
      url: `https://t.me/${idMatch[1]}/${idMatch[2]}`,
    });
  }

  const unique = new Map(posts.map((post) => [post.url, post]));
  return [...unique.values()].sort((a, b) =>
    a.time === b.time ? a.number - b.number : a.time.localeCompare(b.time),
  );
}

export function oldestTelegramPostNumber(posts) {
  if (!posts.length) return null;
  return Math.min(...posts.map((post) => post.number));
}
