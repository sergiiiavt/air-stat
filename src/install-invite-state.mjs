// Browser-driven installation is optional; a manual Chrome guide remains available
// even when the browser does not emit beforeinstallprompt.
export const INSTALL_DISMISS_DAYS = 30;
const DISMISS_MS = INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;

export function isAndroidChrome(userAgent) {
  return /Android/i.test(userAgent)
    && /Chrome\/\d+/i.test(userAgent)
    && !/(?:EdgA|OPR|SamsungBrowser|DuckDuckGo|Firefox)/i.test(userAgent);
}

export function shouldOfferInstallInvite({ userAgent, standalone, dismissedAt, now }) {
  if (standalone || !isAndroidChrome(userAgent)) return false;
  const dismissed = Number(dismissedAt);
  return !(Number.isFinite(dismissed) && dismissed > 0 && dismissed <= now && now - dismissed < DISMISS_MS);
}
