/**
 * Derives MultiChoiceSelector rows from a zod object schema.
 *
 * Three files were doing this same walk — the Web Pixel event list, the PostHog
 * JS config, and the Iris SDK config — each with its own slightly different
 * types, and two of them carrying a large commented-out hand-written version of
 * the array they now generate. The Web Pixel copy also didn't typecheck: it
 * indexed a `Record<string, string>` with a `typeName` TypeScript had already
 * narrowed to `ZodDefault`, and assigned a plain `string` key where the row type
 * wanted a key of the schema.
 *
 * Keeping the schema as the single source means adding a setting is a one-line
 * schema change rather than a form edit.
 */
import type { ZodTypeAny } from 'zod';
import type { Settings } from '../common/interfaces/feature-settings.interface';
import { SettingType } from '../common/interfaces/feature-settings.interface';

const ZOD_TO_SETTING: Record<string, SettingType> = {
  ZodEnum: SettingType.Select,
  ZodString: SettingType.Text,
  ZodNumber: SettingType.Number,
  ZodBoolean: SettingType.Checkbox,
  ZodArray: SettingType.List,
};

/**
 * @param shape a zod object's `.shape`. Every field must be a `ZodDefault` — the
 *   default is what seeds the row's value, and a field without one would render
 *   as `undefined`.
 */
export function deriveSettingsRows<K extends string>(
  shape: Record<string, ZodTypeAny>,
): Settings<K>[] {
  return Object.entries(shape).map(([key, field]) => {
    // The zod internals below (`_def`, `isOptional`) aren't in the public types,
    // so this walk is untyped by necessity — contained to this one function
    // rather than repeated at three call sites.
    let inner = field as any;
    const defaultValue = inner._def.defaultValue();
    while (inner.isOptional() || inner.isNullable()) {
      inner = inner._def.innerType;
    }
    const typeName: string = inner._def.typeName;

    const base = {
      key: key as K,
      description: inner._def.description || '',
      filteredOut: false,
      type: ZOD_TO_SETTING[typeName],
      value: defaultValue,
    };

    return (
      typeName === 'ZodEnum' ? { ...base, selectOptions: inner._def.values } : base
    ) as Settings<K>;
  });
}

/**
 * Layers a shop's saved values over the schema defaults.
 *
 * A saved `false` must survive, so this checks key presence rather than using
 * `??` or `||` — either would quietly reinstate the default.
 */
export function withSavedValues<K extends string>(
  rows: Settings<K>[],
  saved: Partial<Record<K, unknown>> | null | undefined,
): Settings<K>[] {
  if (!saved) return rows;
  return rows.map((row) =>
    row.key in saved ? ({ ...row, value: (saved as any)[row.key] } as Settings<K>) : row,
  );
}
