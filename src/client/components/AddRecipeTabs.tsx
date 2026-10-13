import { useNavigate } from 'react-router';
import { SegmentedControl } from './ui/SegmentedControl';

export type AddRecipeTab = 'link' | 'manual';

const OPTIONS = [
  { value: 'link', label: 'Z linku' },
  { value: 'manual', label: 'Wpiszę sama' },
] as const;

const PATHS: Record<AddRecipeTab, string> = { link: '/przepisy/z-linku', manual: '/przepisy/nowy' };

/** The two cards of the "Dodaj przepis" screen; each one keeps its own address. */
export function AddRecipeTabs({ active }: { active: AddRecipeTab }) {
  const navigate = useNavigate();
  return (
    <SegmentedControl
      label="Sposób dodania przepisu"
      options={OPTIONS}
      value={active}
      onChange={(tab) => {
        if (tab !== active) void navigate(PATHS[tab], { replace: true });
      }}
    />
  );
}
