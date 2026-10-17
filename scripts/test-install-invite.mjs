import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isAndroidChrome, shouldOfferInstallInvite } from '../src/install-invite-state.mjs';

const html = readFileSync('index.html', 'utf8');
const script = html.match(/<script id="install-event-handler">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'The browser install event must be intercepted before React starts');

const target = new EventTarget();
const window = {
  addEventListener: target.addEventListener.bind(target),
  dispatchEvent: target.dispatchEvent.bind(target),
};
vm.runInNewContext(script, { window, Event });
let available = 0;
let installed = 0;
window.addEventListener('air-alert-install-ready', () => available++);
window.addEventListener('air-alert-installed', () => installed++);

const prompt = new Event('beforeinstallprompt', { cancelable: true });
window.dispatchEvent(prompt);
assert.equal(prompt.defaultPrevented, true, 'The browser auto-promotion must be suppressed');
assert.equal(available, 1);
assert.equal(window.__airAlertInstallPrompt, prompt);

window.dispatchEvent(new Event('appinstalled'));
assert.equal(installed, 1);
assert.equal(window.__airAlertInstallPrompt, null);

// Chrome may not issue beforeinstallprompt (especially immediately after an uninstall).
// The optional guidance must remain available even without that event.
const chrome = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const samsung = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/130.0.0.0 SamsungBrowser/27.0';
const now = Date.UTC(2026, 9, 17);
const eligibility = { userAgent: chrome, standalone: false, dismissedAt: null, now };
assert.equal(isAndroidChrome(chrome), true);
assert.equal(isAndroidChrome(samsung), false);
assert.equal(shouldOfferInstallInvite(eligibility), true, 'Android Chrome should see fallback without browser event');
assert.equal(shouldOfferInstallInvite({ ...eligibility, standalone: true }), false);
assert.equal(shouldOfferInstallInvite({ ...eligibility, userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130.0.0.0' }), false);
assert.equal(shouldOfferInstallInvite({ ...eligibility, dismissedAt: String(now - 86_400_000) }), false, 'Not now should snooze');
assert.equal(shouldOfferInstallInvite({ ...eligibility, dismissedAt: String(now - 31 * 86_400_000) }), true, 'Offer again after 30 days');
assert.equal(shouldOfferInstallInvite({ ...eligibility, dismissedAt: 'bad-data' }), true, 'Corrupt storage must not hide invite');

const ui = readFileSync('src/components/InstallInvite.tsx', 'utf8');
assert.ok(ui.includes('writeBrowserStorage(DISMISS_KEY'));
assert.ok(ui.includes('display-mode: standalone'));
assert.ok(ui.includes('prompt()'));
assert.ok(ui.includes('aria-labelledby'));
assert.ok(ui.includes('window.setTimeout(() => setVisible(true), WAIT_MS)'), 'No hard dependency on beforeinstallprompt');
assert.ok(ui.includes('shouldOfferInstallInvite('), 'Browser gating must use tested eligibility');
assert.ok(ui.includes('aria-expanded={showGuide}'), 'Manual instructions must be accessible');
assert.ok(ui.includes('hidden={!showGuide}'), 'Guide is initially collapsed');
assert.ok(ui.includes('guideText'), 'Manual instructions must exist in both languages');
const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.description.includes('сайт'));
for (const size of [192, 512]) {
  const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}` && item.type === 'image/png');
  assert.ok(icon, `Missing Chrome-compatible ${size}px PNG manifest icon`);
  const png = readFileSync('public' + icon.src);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
console.log('Install event, fallback visibility, dismissal and manifest checks passed.');
