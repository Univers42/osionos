// The "Account context" switch, and the setting behind it: rendered by Settings › AI and by the
// AI Hub's "Context & privacy" section, which also reads the setting to show what is sent.
import { useUserStore } from '@/features/auth';
import { useAiSettingsStore } from '@/store/settings';
import { Toggle } from '@/shared/ui';
import { SettingRow } from '../ui/settingsKit';

// Same default as withAccountContext: an unset value counts as on.
export function useAccountContext(): [boolean, (checked: boolean) => void] {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? 'local-workspace');
  const settings = useAiSettingsStore((state) => state.getData(workspaceId));
  const update = useAiSettingsStore((state) => state.update);
  return [settings.accountContext ?? true, (checked) => update(workspaceId, { accountContext: checked })];
}

export const AccountContextToggle = () => {
  const [checked, setChecked] = useAccountContext();
  return (
    <SettingRow title="Account context" description="Lets the assistant know your name, workspace, role, what you have open (page, tabs, panel) and the titles of the pages you can read. It is sent to the AI model you chose with each message." action={<Toggle checked={checked} onChange={setChecked} label="Account context" />} />
  );
};
