/**
 * Ukrainska Pravda articles append same-topic recommendations after their
 * article text. Plain HTML-to-text extraction otherwise promotes those links
 * into apparent evidence for unrelated incidents and districts.
 *
 * Scope the text to the actual headline and cut off recommendation/footer
 * sections. If a headline is absent from the retrieved page, do not feed
 * unrelated page chrome to incident detection.
 */
export function pravdaArticleEvidence(pageText, headline) {
  const text = String(pageText ?? '').replace(/\s+/g, ' ').trim();
  const title = String(headline ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return '';
  const candidates = [title, title.replace(/^(оновлено|updated)\s+/iu, '')];
  const indices = candidates.map((candidate) => text.indexOf(candidate)).filter((index) => index >= 0);
  if (!indices.length) return title;

  const articleAndRecommendations = text.slice(Math.min(...indices));
  const footer = /Шановні читачі, просимо дотримуватись|Головне сьогодні|Щоденна новинна розсилка|Останні новини|Всі новини/iu;
  const end = articleAndRecommendations.search(footer);
  return (end < 0 ? articleAndRecommendations : articleAndRecommendations.slice(0, end)).trim();
}
