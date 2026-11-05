import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, copy } from '../../content/copy';
import { makeProfile } from '../../test/fixtures';
import { toStoredMass } from '../../domain/units';
import { BodyMassForm, type BodyMassFormProps } from './BodyMassForm';

const Q = copy('quantity.bodyMass');

function setup(patch: Partial<BodyMassFormProps> = {}): BodyMassFormProps['onSubmit'] {
  const onSubmit = vi.fn<BodyMassFormProps['onSubmit']>(() => true);
  render(
    <BodyMassForm
      profile={makeProfile()}
      idPrefix="mass-test"
      quantity={Q}
      role="choose"
      referenceKg={80} // [kg]
      submitLabel={copy('button.logBodyMass')}
      onSubmit={onSubmit}
      {...patch}
    />,
  );
  return onSubmit;
}

function type(text: string, unit = 'kg'): void {
  fireEvent.change(screen.getByLabelText(`${Q} (${unit})`), { target: { value: text } });
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyMass') }));
}

describe('BodyMassForm (spec R9, audit G08)', () => {
  it('logs a plausible mass with the chosen role', () => {
    const onSubmit = setup();
    fireEvent.change(screen.getByLabelText(copy('label.massRole')), { target: { value: 'pre' } });
    type('80,5');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(80.5, 'pre'); // [kg]
  });

  it('defaults the role select to morning', () => {
    const onSubmit = setup();
    type('81');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(81, 'morning');
  });

  it('states the bound in words instead of throwing or staying silent', () => {
    const onSubmit = setup({ profile: makeProfile({ units: 'imperial' }) });
    type('1800', 'lb');
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(FORMAT.atMost(Q, 1102.3, 'lb'));
    type('', 'lb'); // the field is labelled in the profile's unit
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('error.valueRequired'));
  });

  it('asks once about a mass far from the last one; Log Anyway stores it', () => {
    const onSubmit = setup({ profile: makeProfile({ units: 'imperial' }), referenceKg: toStoredMass(180, 'imperial') });
    type('18', 'lb'); // the G03 typo
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('advice.massLooksOff'));
    fireEvent.click(screen.getByRole('button', { name: copy('button.logAnyway') }));
    expect(onSubmit).toHaveBeenCalledWith(toStoredMass(18, 'imperial'), 'morning'); // [kg]
  });

  it('drops the question once the field is edited', () => {
    setup();
    type('8');
    submit();
    type('80');
    expect(screen.queryByRole('button', { name: copy('button.logAnyway') })).toBeNull();
  });

  it('keeps a fixed role and shows no select', () => {
    const onSubmit = setup({ role: 'post' });
    expect(screen.queryByLabelText(copy('label.massRole'))).toBeNull();
    type('79');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(79, 'post');
  });

  it('submits an untouched edit exactly, whatever the display rounding', () => {
    const storedKg = toStoredMass(180, 'imperial') + 0.0001; // [kg] not on the 0.1 lb display grid
    const onSubmit = setup({ profile: makeProfile({ units: 'imperial' }), initialKg: storedKg, initialRole: null });
    submit();
    expect(onSubmit).toHaveBeenCalledWith(storedKg, null);
  });

  it('says so when the store refuses', () => {
    setup({ onSubmit: () => false });
    type('80');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('error.outsideAccepted'));
  });
});
