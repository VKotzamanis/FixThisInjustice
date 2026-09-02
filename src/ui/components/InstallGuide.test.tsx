// src/ui/components/InstallGuide.test.tsx
//
// The guide shown when the runtime reports pushAvailability() === 'needs-install'. Every
// assertion quotes the default copy table, as the copy contract requires, so a reworded step
// fails here rather than shipping a guide that names a control the platform does not have.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstallGuide } from './InstallGuide';
import { copy } from '../../content/copy';

describe('InstallGuide', () => {
  it('gives the iOS Share to Add to Home Screen steps, in order', () => {
    render(<InstallGuide />);
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(steps.slice(0, 4)).toEqual([
      copy('status.installIosSafari'),
      copy('status.installIosShare'),
      copy('status.installIosAdd'),
      copy('status.installIosOpen'),
    ]);
  });

  it('states the iOS version the app requires', () => {
    render(<InstallGuide />);
    // 18.4, not 16.4: Web Push reached installed iOS web apps in 16.4, but Screen Wake Lock
    // inside one was broken until 18.4, and this app uses it during a session.
    expect(screen.getByText(copy('advice.installIosVersion'))).toBeInTheDocument();
    expect(copy('advice.installIosVersion')).toContain('18.4');
  });

  it('gives the Android Chrome menu to Install app steps', () => {
    render(<InstallGuide />);
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(steps.slice(4)).toEqual([
      copy('status.installAndroidMenu'),
      copy('status.installAndroidInstall'),
      copy('status.installAndroidOpen'),
    ]);
  });

  it('says why an installed app is required at all', () => {
    render(<InstallGuide />);
    expect(screen.getByText(copy('advice.installOnlyInstalledApp'))).toBeInTheDocument();
  });

  it('names both platforms it covers', () => {
    render(<InstallGuide />);
    expect(screen.getByText(copy('label.installIos'))).toBeInTheDocument();
    expect(screen.getByText(copy('label.installAndroid'))).toBeInTheDocument();
  });

  it('carries no screenshot: the steps are text a screen reader can follow', () => {
    const { container } = render(<InstallGuide />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('renders every string from the copy table, never a literal', () => {
    const { container } = render(<InstallGuide />);
    const rendered = container.textContent ?? '';
    const table = [
      'hero.installHomeScreen',
      'advice.installOnlyInstalledApp',
      'label.installIos',
      'status.installIosSafari',
      'status.installIosShare',
      'status.installIosAdd',
      'status.installIosOpen',
      'advice.installIosVersion',
      'label.installAndroid',
      'status.installAndroidMenu',
      'status.installAndroidInstall',
      'status.installAndroidOpen',
    ] as const;
    const joined = table.map((key) => copy(key)).join('');
    // Every character the guide renders comes from those twelve keys and nothing else.
    expect(rendered.replaceAll(/\s+/g, '')).toBe(joined.replaceAll(/\s+/g, ''));
  });
});
