/** Share links and app-link files (contract: "Share links"). Read from env per request. */
export interface ShareConfig {
  shareBaseUrl: string;
  iosAppStoreId: string | null;
  androidPackage: string | null;
  appleTeamId: string | null;
  /** The app's bundle id: the first APPLE_BUNDLE_ID entry (others may be Services IDs). */
  appleBundleId: string | null;
  androidFingerprints: string[];
}

const clean = (v: string | undefined) => v?.trim() || null;

export function readShareConfig(
  env: NodeJS.ProcessEnv = process.env,
): ShareConfig {
  return {
    shareBaseUrl: (
      clean(env.SHARE_BASE_URL) ?? 'https://crunchiiapp.com'
    ).replace(/\/+$/, ''),
    iosAppStoreId: clean(env.IOS_APP_STORE_ID)?.replace(/^id/i, '') ?? null,
    androidPackage: clean(env.ANDROID_PACKAGE),
    appleTeamId: clean(env.APPLE_TEAM_ID),
    appleBundleId: clean(env.APPLE_BUNDLE_ID?.split(',')[0]),
    androidFingerprints: (env.ANDROID_SHA256_FINGERPRINTS ?? '')
      .split(',')
      .map((f) => f.trim().toUpperCase())
      .filter(Boolean),
  };
}

/** Paths the apps open (iOS universal links / Android app links). */
export const APP_LINK_PATHS = ['/p/*', '/r/*', '/u/*'];

/** GET /.well-known/apple-app-site-association */
export function buildAppleAppSiteAssociation(c: ShareConfig) {
  const appIDs =
    c.appleTeamId && c.appleBundleId
      ? [`${c.appleTeamId}.${c.appleBundleId}`]
      : [];
  return {
    applinks: {
      details: appIDs.length
        ? [{ appIDs, components: APP_LINK_PATHS.map((p) => ({ '/': p })) }]
        : [],
    },
  };
}

/** GET /.well-known/assetlinks.json */
export function buildAssetLinks(c: ShareConfig) {
  if (!c.androidPackage || !c.androidFingerprints.length) return [];
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: c.androidPackage,
        sha256_cert_fingerprints: c.androidFingerprints,
      },
    },
  ];
}

export const appStoreUrl = (c: ShareConfig) =>
  c.iosAppStoreId ? `https://apps.apple.com/app/id${c.iosAppStoreId}` : null;

export const playStoreUrl = (c: ShareConfig) =>
  c.androidPackage
    ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(c.androidPackage)}`
    : null;
