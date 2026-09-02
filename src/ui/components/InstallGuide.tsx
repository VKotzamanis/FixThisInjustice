import { type JSX } from 'react';
import { copy } from '../../content/copy';

/**
 * How to install this app to the Home Screen, shown when the runtime cannot receive Web Push
 * as a browser tab (`pushAvailability() === 'needs-install'`, src/domain/reminders/client.ts).
 *
 * Why it exists. iOS delivers Web Push only to a web app installed on the Home Screen (Safari
 * 16.4 and later); a Safari tab exposes no PushManager at all, so the subscribe call the
 * settings panel would make cannot succeed and there is no permission prompt to show. The
 * remedy is an instruction, not a retry, which is why this is copy rather than a button.
 *
 * The version this guide states is 18.4 rather than 16.4. Web Push arrived in 16.4, but Screen
 * Wake Lock inside an installed web app was broken until 18.4 and the training screen uses it,
 * so 18.4 is the floor for the app as a whole, not for notifications alone.
 *
 * Android is covered in the same guide even though Chrome there receives push in a tab: a user
 * sent here by a runtime that reports 'needs-install' should not have to guess which set of
 * steps applies to the device in their hand. Neither block names a browser vendor as a
 * DETECTION rule, and nothing in this component reads a user-agent string: the caller decided
 * from feature detection alone, and this file only writes down what to tap.
 *
 * No screenshots. A screenshot of a platform control ages out with the next OS release and
 * cannot be read aloud, so each step names the control in words instead.
 */
export function InstallGuide(): JSX.Element {
  return (
    <aside className="fti-reminders-install" aria-labelledby="fti-install-heading">
      <h3 id="fti-install-heading">{copy('hero.installHomeScreen')}</h3>
      <p>{copy('advice.installOnlyInstalledApp')}</p>

      <h4>{copy('label.installIos')}</h4>
      <ol>
        <li>{copy('status.installIosSafari')}</li>
        <li>{copy('status.installIosShare')}</li>
        <li>{copy('status.installIosAdd')}</li>
        <li>{copy('status.installIosOpen')}</li>
      </ol>
      <p>{copy('advice.installIosVersion')}</p>

      <h4>{copy('label.installAndroid')}</h4>
      <ol>
        <li>{copy('status.installAndroidMenu')}</li>
        <li>{copy('status.installAndroidInstall')}</li>
        <li>{copy('status.installAndroidOpen')}</li>
      </ol>
    </aside>
  );
}
