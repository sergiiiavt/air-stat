/** A research episode start is not a verified missile launch timestamp. */
export function ballisticTime(startedAt, attackDate) {
  if (typeof startedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(startedAt)) return null;
  if (!/(?:[zZ]|[+-]\d{2}:\d{2})$/.test(startedAt)) return null;
  const time = new Date(startedAt);
  if (!Number.isFinite(time.valueOf())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(time);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (`${p.year}-${p.month}-${p.day}` !== attackDate) return null;
  return { label: `${p.hour}:${p.minute}`, minuteOfDay: Number(p.hour) * 60 + Number(p.minute) };
}
export function ballisticDays(attacks) {
  const grouped = new Map();
  for (const attack of attacks) {
    const row = grouped.get(attack.date) ?? { date: attack.date, attacks: [], timed: 0 };
    row.attacks.push(attack);
    if (ballisticTime(attack.startedAt, attack.date)) row.timed += 1;
    grouped.set(attack.date, row);
  }
  return [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date));
}
