import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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

const ui = readFileSync('src/components/InstallInvite.tsx', 'utf8');
assert.ok(ui.includes('writeBrowserStorage(DISMISS_KEY'));
assert.ok(ui.includes('display-mode: standalone'));
assert.ok(ui.includes('prompt()'));
assert.ok(ui.includes('aria-labelledby'));
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
console.log('Install interception, dismissal and manifest checks passed.');
