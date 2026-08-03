import type { ThemeRole } from '../../types/admin.types';
import { queryThemes } from '../queries/query-themes';
import  JSON5 from "json5"
import { serializeError } from 'serialize-error';

/**
 * Is an app embed block switched on in the live theme?
 *
 * @param appEmbedUuid The theme extension's registration UUID.
 * @param blockHandle  Which block within that extension, e.g. 'posthog_js_web'.
 *   Required in practice: Shopify allows one theme extension per app, so all our
 *   blocks share the UUID above and matching on it alone would report the Iris
 *   embed as active whenever the PostHog one was. Omitting it keeps the old
 *   any-block-will-do behaviour.
 */
export async function appEmbedStatus(appEmbedUuid: string, blockHandle?: string) {
  // An unset UUID would make the `type.includes(uuid)` test below match every
  // block, reporting an embed as active when it isn't installed at all.
  if (!appEmbedUuid) {
    return false;
  }

  const themes = await queryThemes({
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

  try {
    if (!settingsData) {
      return false;
    }
    /**current can be a string for example "DEFAULT" for new theme installations */
    const { current } = JSON5.parse(settingsData) as { current?: {blocks?: Record<string, { type: string; disabled?: boolean }>} | null | string };

    if (typeof current === 'string' || current instanceof String || current == undefined) {
      return false;
    }

    if (!current.blocks) {
      return false;
    }

    // A block's `type` reads like
    //   shopify://apps/<app>/blocks/<block-handle>/<extension-uuid>
    // so both parts have to match to identify one block of a multi-block
    // extension.
    return Object.values(current.blocks).some((payload) => {
      if (payload.disabled) {
        return false;
      }
      if (!payload.type.includes(appEmbedUuid)) {
        return false;
      }
      return blockHandle ? payload.type.includes(`/${blockHandle}/`) : true;
    })
  } catch (error) {
    throw new Error('failed to resolve app embed status', {
      cause: serializeError({
        error,
        settingsData,
      }),
    });
  }
}
