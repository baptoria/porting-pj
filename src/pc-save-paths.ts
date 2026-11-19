import { canonicalPath } from './archive';
import type { Profile } from './model';

export const PC_SAVE_LIMITS = { count: 512, file: 8 * 1024 * 1024, total: 32 * 1024 * 1024 };
export const PC_SAVE_EXTENSION = /\.(DAT|CFG|SAV)$/i;
export const PC_SAVE_SHORT_NAME = /^[A-Z0-9_!#$%&'()@^`{}~\-]{1,8}(\.[A-Z0-9_!#$%&'()@^`{}~\-]{1,3})?$/;
export function pcSaveRoot(profile: Profile) {
  const entry = canonicalPath(profile.executable);
  return entry.slice(0, entry.lastIndexOf('/') + 1) + 'SAVE/';
}
