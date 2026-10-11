import { useState } from 'react';
import { readThemeChoice, setThemeChoice, type ThemeChoice } from '../data/theme';
import { SegmentedControl } from './ui/SegmentedControl';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
] as const;

/** Colour theme picker for Settings. Local to the device, so it works offline. */
export function ThemeSetting() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
  const handleChange = (next: ThemeChoice) => {
    setThemeChoice(next);
    setChoice(next);
  };
  return (
    <section aria-labelledby="theme-heading" className="flex flex-col gap-2">
      <h2 id="theme-heading" className="text-lg font-semibold">
        Motyw
      </h2>
      <SegmentedControl label="Motyw" options={OPTIONS} value={choice} onChange={handleChange} />
    </section>
  );
}
