import { useEffect, useState } from 'react';
import type { Language } from '../i18n';
import { shouldOfferInstallInvite } from '../install-invite-state.mjs';
import { readBrowserStorage, writeBrowserStorage } from '../theme';

type BrowserInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type InstallWindow = Window & { __airAlertInstallPrompt?: BrowserInstallEvent | null };

const DISMISS_KEY = 'air-alert-install-dismissed-at';
const WAIT_MS = 8_000;

const copy = {
  uk: {
    title: 'Додати Air Alert Stat на телефон?',
    details: 'Це той самий сайт: іконка на головному екрані та відкриття без вкладок Chrome.',
    note: 'Необов’язково. Без APK і додаткових дозволів. Сайтом можна й далі користуватися у браузері.',
    install: 'Встановити',
    guide: 'Як додати',
    guideText: 'У Chrome відкрийте меню ⋮ → «Додати на головний екран» → «Встановити» або «Створити ярлик». Назви пунктів можуть відрізнятися.',
    later: 'Не зараз',
  },
  en: {
    title: 'Add Air Alert Stat to your phone?',
    details: 'It is the same website, with a home-screen icon and a window without Chrome tabs.',
    note: 'Optional. No APK or extra permissions. You can keep using the website in Chrome.',
    install: 'Install',
    guide: 'How to add',
    guideText: 'In Chrome, open ⋮ → Add to Home screen → Install or Create shortcut. Menu labels may vary.',
    later: 'Not now',
  },
} as const;

export function InstallInvite({ language }: { language: Language }) {
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] = useState<BrowserInstallEvent | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const allowed = shouldOfferInstallInvite({
      userAgent: window.navigator.userAgent,
      standalone: window.matchMedia('(display-mode: standalone)').matches,
      dismissedAt: readBrowserStorage(DISMISS_KEY),
      now: Date.now(),
    });
    if (!allowed) return;

    // The optional guidance is not conditional on beforeinstallprompt.
    // Chrome may not emit that event after an uninstall or on early visits.
    const timer = window.setTimeout(() => setVisible(true), WAIT_MS);
    const ready = () => setInstallEvent((window as InstallWindow).__airAlertInstallPrompt ?? null);
    const installed = () => {
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener('air-alert-install-ready', ready);
    window.addEventListener('air-alert-installed', installed);
    ready(); // The event can arrive before React mounts.
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('air-alert-install-ready', ready);
      window.removeEventListener('air-alert-installed', installed);
    };
  }, []);

  const dismiss = () => {
    writeBrowserStorage(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = () => {
    if (!installEvent) return;
    setVisible(false);
    (window as InstallWindow).__airAlertInstallPrompt = null;
    // Triggered directly by a click, as required by the browser install API.
    try {
      void installEvent
        .prompt()
        .then(() => installEvent.userChoice)
        .then(({ outcome }) => {
          if (outcome !== 'accepted') writeBrowserStorage(DISMISS_KEY, String(Date.now()));
        })
        .catch(() => writeBrowserStorage(DISMISS_KEY, String(Date.now())));
    } catch {
      writeBrowserStorage(DISMISS_KEY, String(Date.now()));
    }
  };

  if (!visible) return null;
  const t = copy[language];

  return (
    <aside className="install-invite" aria-labelledby="install-invite-title">
      <div className="install-invite__copy">
        <strong id="install-invite-title">{t.title}</strong>
        <p>{t.details}</p>
        <p className="install-invite__note">{t.note}</p>
        {!installEvent && (
          <p className="install-invite__guide" id="install-invite-guide" hidden={!showGuide}>
            {t.guideText}
          </p>
        )}
      </div>
      <div className="install-invite__actions">
        <button type="button" className="install-invite__later" onClick={dismiss}>
          {t.later}
        </button>
        {installEvent ? (
          <button type="button" className="install-invite__install" onClick={install}>
            {t.install}
          </button>
        ) : (
          <button
            type="button"
            className="install-invite__install"
            aria-expanded={showGuide}
            aria-controls="install-invite-guide"
            onClick={() => setShowGuide((current) => !current)}
          >
            {t.guide}
          </button>
        )}
      </div>
    </aside>
  );
}
