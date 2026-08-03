import type { AdminGraphqlClient } from '@shopify/shopify-app-remix/server';
import type { ThemeRole } from '../../types/admin.types';
import { queryThemes } from '../queries/query-themes';
import  JSON5 from "json5"

/**
 * Server-side twin of app/common.client/procedures/app-embed-status.ts — see
 * there for why `blockHandle` matters (one theme extension, several blocks).
 */
export async function appEmbedStatus(
  graphq: AdminGraphqlClient,
  appEmbedUuid: string,
  blockHandle?: string,
) {
  // An unset UUID would make the `type.includes(uuid)` test below match every
  // block, reporting an embed as active when it isn't installed at all.
  if (!appEmbedUuid) {
    return false;
  }

  const themes = await queryThemes(graphq, {
    files: ['config/settings_data.json'],
    first: 1,
    roles: ['MAIN' as ThemeRole],
  });

  if (!themes) {
    return false;
  }
  const mainTheme = themes[0];

  if (!mainTheme) {
    return false;
  }

  if (!mainTheme.files) {
    return false;
  }

  const settingsData = mainTheme.files.nodes?.[0]?.body?.content;

  if (!settingsData) {
    return false;
  }
  /**current can be a string for example "DEFAULT" for new theme installations */
  const { current } = JSON5.parse(settingsData) as { current: {blocks: Record<string, { type: string; disabled?: boolean }>} | string };

  if (typeof current === 'string' || current instanceof String) {
    return false;
  }

  return Object.values(current.blocks).some((payload) => {
    if (payload.disabled) {
      return false;
    }
    if (!payload.type.includes(appEmbedUuid)) {
      return false;
    }
    // `type` reads shopify://apps/<app>/blocks/<block-handle>/<extension-uuid>.
    return blockHandle ? payload.type.includes(`/${blockHandle}/`) : true;
  })
}
