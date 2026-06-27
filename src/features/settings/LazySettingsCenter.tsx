import { lazy, Suspense, type ComponentProps } from 'react';
import type { SettingsCenter as SettingsCenterComponent } from './SettingsCenter';

/**
 * Code-split entry for the Settings center.
 *
 * SettingsCenter statically pulls pdf-lib, jszip, qrcode, @simplewebauthn and
 * i18next (~600 KiB). It only ever renders on demand, so it must not sit in the
 * initial bundle. This wrapper defers the whole subtree (and its heavy deps)
 * until the panel is actually opened.
 */
const SettingsCenterImpl = lazy(() =>
  import('./SettingsCenter').then((module) => ({ default: module.SettingsCenter })),
);

type SettingsCenterProps = ComponentProps<typeof SettingsCenterComponent>;

export function LazySettingsCenter(props: SettingsCenterProps) {
  return (
    <Suspense fallback={null}>
      <SettingsCenterImpl {...props} />
    </Suspense>
  );
}
