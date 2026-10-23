import { darkModeOf } from './bootstrap.service';
import { DEFAULT_AD_RULES } from './ad-rules.config';

describe('darkModeOf (users.app_settings → settings.darkMode)', () => {
  it.each([
    [null, null],
    [{}, null],
    [{ toggledark_mode: 'true', dark_mode: 'true' }, 'system'],
    [{ toggledark_mode: 'false', dark_mode: 'true' }, 'dark'],
    [{ dark_mode: 'false' }, 'light'],
  ])('%j → %j', (settings, expected) => {
    expect(darkModeOf(settings as any)).toBe(expected);
  });
});

it('ad rules default to adEvery 8 and banners off', () => {
  expect(DEFAULT_AD_RULES).toEqual({ adEvery: 8, bannerEvery: 0 });
});
