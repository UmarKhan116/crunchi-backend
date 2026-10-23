import {
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  readShareConfig,
} from './share-config';

describe('app-link files', () => {
  const env = {
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_BUNDLE_ID: 'com.crunchy, com.crunchy.web',
    ANDROID_PACKAGE: 'com.crunchii',
    ANDROID_SHA256_FINGERPRINTS: ' aa:bb:cc ,DD:EE:FF,, ',
  };

  it('AASA: one detail for TEAM.bundle with /p, /r and /u components', () => {
    expect(buildAppleAppSiteAssociation(readShareConfig(env))).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['TEAM123456.com.crunchy'],
            components: [{ '/': '/p/*' }, { '/': '/r/*' }, { '/': '/u/*' }],
          },
        ],
      },
    });
  });

  it('assetlinks: handle_all_urls for the package with every fingerprint', () => {
    expect(buildAssetLinks(readShareConfig(env))).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.crunchii',
          sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'],
        },
      },
    ]);
  });

  it('stays valid (empty) when not configured', () => {
    const c = readShareConfig({});
    expect(buildAppleAppSiteAssociation(c)).toEqual({
      applinks: { details: [] },
    });
    expect(buildAssetLinks(c)).toEqual([]);
    expect(c.shareBaseUrl).toBe('https://crunchiiapp.com');
  });
});
