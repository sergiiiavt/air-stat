export const INSTALL_DISMISS_DAYS: number;
export function isAndroidChrome(userAgent: string): boolean;
export function shouldOfferInstallInvite(options: {
  userAgent: string;
  standalone: boolean;
  dismissedAt: string | null;
  now: number;
}): boolean;
