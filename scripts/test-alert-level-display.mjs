import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Exercise real components with immutable API fixtures, without network or D1 writes.
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(root, '.test-alert-display-'));
const originalWindow = globalThis.window;
function compile(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) compile(path);
    else if (/\.tsx?$/.test(entry.name)) {
      const output = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText.replace(/(from\s*['"])(\.[^'"]+)(['"])/g, (match, before, specifier, after) =>
        /\.[a-z]+$/.test(specifier) ? match : `${before}${specifier}.mjs${after}`)
        // Vite handles this CJS interop in production; plain Node needs a default import.
        .replace(/import maplibregl, \{([^}]+)\} from 'maplibre-gl';/, "import maplibregl from 'maplibre-gl';\nconst {$1} = maplibregl;");
      writeFileSync(path.replace(/\.tsx?$/, '.mjs'), output);
    }
  }
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const totalMarkup = (html) => html.match(/<div class="hourly-day__total"[\s\S]*?<\/div>/g);
const totalPoints = (html) => html.match(/<polyline class="trend-chart__line[^"]*" points="[^"]+"/g)?.map((line) => line.match(/points="[^"]+"/)[0]);

try {
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(root, 'shared'), join(dir, 'shared'), { recursive: true });
  compile(join(dir, 'src'));
  const load = (path) => import(pathToFileURL(join(dir, 'src', path)).href);
  const { DailyTimeline } = await load('components/DailyTimeline.mjs');
  const { HourlyTimeline } = await load('components/HourlyTimeline.mjs');
  const { TrendsPanel } = await load('components/TrendsPanel.mjs');
  const { default: App } = await load('App.mjs');
  const days = freeze([
    { date: '2026-09-20', scope: 'kyiv-city', alertCount: 2, alertSeconds: 5400,
      alertLevelSeconds: { yellow: 3000, red: 1200, unknown: 1200 }, incidentCount: 1, killed: 0, injured: 0 },
    // Legacy timing with no level data must remain visible too.
    { date: '2026-09-21', scope: 'kyiv-city', alertCount: 1, alertSeconds: 3600, incidentCount: 0, killed: 0, injured: 0 },
  ]);
  const window = (start, end, alertLevel, isActive = false) => ({ id: start, scope: 'kyiv-city',
    localDate: '2026-09-20', startedAt: `2026-09-20T${start}:00Z`, endedAt: `2026-09-20T${end}:00Z`,
    alertLevel, isActive, alertType: 'air_raid', threatTypes: alertLevel === 'red' ? ['cruise'] : ['uav'] });
  const windows = freeze([
    window('10:00', '10:20', 'yellow'), window('10:20', '10:40', 'red'),
    window('10:40', '11:00', 'unknown'), window('11:30', '12:00', 'yellow', true),
  ]);
  const snapshot = JSON.stringify({ days, windows });

  for (const language of ['uk', 'en']) {
    const props = { from: '2026-09-20', to: '2026-09-26', days, language };
    const dailyProps = { ...props, incidents: [], selectedDate: null, onSelectDate() {} };
    const combined = render(DailyTimeline, dailyProps);
    assert.equal(combined, render(DailyTimeline, { ...dailyProps, splitAlertLevels: false }));
    const split = render(DailyTimeline, { ...dailyProps, splitAlertLevels: true });
    assert.doesNotMatch(combined, /alert-level--(?:yellow|red|unknown)/);
    for (const level of ['yellow', 'red', 'unknown']) assert.ok(split.includes(`alert-level--${level}`));
    assert.deepEqual(combined.match(/class="timeline-bar-fill" style="[^"]+"/g), split.match(/class="timeline-bar-fill" style="[^"]+"/g), 'Keep all bar heights, including legacy and zero days');
    assert.deepEqual(combined.match(/class="timeline-alert-count"[^>]*>\d+/g), split.match(/class="timeline-alert-count"[^>]*>\d+/g), 'Keep episode counts');
    assert.equal(render(DailyTimeline, dailyProps), combined);

    const hourlyProps = { ...props, windows, scope: 'kyiv-city' };
    const hourlyCombined = render(HourlyTimeline, hourlyProps);
    const hourlySplit = render(HourlyTimeline, { ...hourlyProps, splitAlertLevels: true });
    assert.equal(count(hourlyCombined, /class="hourly-segment /g), 2, 'Join adjacent levels but retain the all-clear gap');
    assert.equal(count(hourlySplit, /class="hourly-segment /g), 4, 'Restore all original level boundaries');
    assert.doesNotMatch(hourlyCombined, /alert-level--(?:yellow|red|unknown)/);
    assert.match(hourlySplit, /alert-level--unknown/);
    assert.deepEqual(totalMarkup(hourlyCombined), totalMarkup(hourlySplit), 'Keep duration and percentage');
    assert.match(hourlyCombined, /hourly-segment--active/, 'Keep active-state information');
    assert.equal(render(HourlyTimeline, hourlyProps), hourlyCombined);

    const trendsCombined = render(TrendsPanel, props);
    const trendsSplit = render(TrendsPanel, { ...props, splitAlertLevels: true });
    assert.doesNotMatch(trendsCombined, /alert-level--(?:yellow|red|unknown)/);
    assert.match(trendsCombined, /trend-chart-card--combined-alerts/);
    assert.equal(count(trendsSplit, /class="trend-chart__level alert-level--/g), 3);
    assert.deepEqual(totalPoints(trendsCombined), totalPoints(trendsSplit), 'Keep total/count/average series values');
    assert.equal(render(TrendsPanel, props), trendsCombined);

    for (const [from, to, startedAt, endedAt] of [
      ['2026-09-20', '2026-09-21', '2026-09-20T20:30:00Z', '2026-09-20T21:30:00Z'],
      ['2026-10-25', '2026-10-25', '2026-10-24T21:00:00Z', '2026-10-25T22:00:00Z'],
      ['2026-03-29', '2026-03-29', '2026-03-28T22:00:00Z', '2026-03-29T21:00:00Z'],
    ]) {
      const p = { ...hourlyProps, from, to, windows: freeze([{ ...windows[0], startedAt, endedAt }]) };
      assert.deepEqual(totalMarkup(render(HourlyTimeline, p)), totalMarkup(render(HourlyTimeline, { ...p, splitAlertLevels: true })), 'Keep cross-midnight and 23/25-hour DST totals');
    }
  }

  for (const view of ['daily', 'hours', 'trends', 'map']) {
    for (const saved of [null, 'false', 'true', 'invalid', 'blocked']) {
      globalThis.window = { location: { search: `?view=${view}&days=7` }, localStorage: {
        getItem(key) { if (saved === 'blocked') throw new Error('Storage blocked'); return key === 'air-alert-split-levels' ? saved : null; },
      } };
      const control = render(App, {}).match(/<input[^>]*role="switch"[^>]*>/g) ?? [];
      assert.equal(control.length, view === 'map' ? 0 : 1, 'One shared control on each relevant view');
      if (view !== 'map') assert.equal(control[0].includes('checked=""'), saved === 'true', 'Default/invalid/blocked storage leaves splitting off');
    }
  }
  assert.equal(JSON.stringify({ days, windows }), snapshot, 'Rendering must not mutate API data');
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  rmSync(dir, { recursive: true, force: true });
}
console.log('Alert display: default-off switch, saved/blocked storage, combined/split charts, gaps, totals, legacy/unknown data and immutable inputs passed.');
