/**
 * Turns IrisJsConfigSchema into the Settings[] rows MultiChoiceSelector renders.
 *
 * Same derivation the PostHog JS Web Config page uses (see
 * app/routes/app.js-web-posthog-settings/default-js-web-settings.ts) — walk the
 * zod shape, read each field's default and description, map its zod type to a
 * control. Keeping the schema as the single source means adding an SDK option is
 * a one-line schema change, not a form edit.
 */
import { IrisJsConfigSchema } from '../common/dto/iris-js-settings.dto';
import type { IrisJsConfig } from '../common/dto/iris-js-settings.dto';
import type { Settings } from '../common/interfaces/feature-settings.interface';
import { SettingType } from '../common/interfaces/feature-settings.interface';

export type IrisJsSettingChoice = Settings<keyof IrisJsConfig>;

const ZOD_TO_SETTING = {
  ZodEnum: SettingType.Select,
  ZodString: SettingType.Text,
  ZodNumber: SettingType.Number,
  ZodBoolean: SettingType.Checkbox,
  ZodArray: SettingType.List,
} as const;

export const defaultIrisJsSettings: IrisJsSettingChoice[] = Object.entries(
  IrisJsConfigSchema.shape,
).map(([key, field]) => {
  // `field` is always a ZodDefault here — iris-js-settings.check.ts enforces it.
  let inner: any = field;
  const defaultValue = inner._def.defaultValue();
  while (inner.isOptional() || inner.isNullable()) {
    inner = inner._def.innerType;
  }
  const typeName = inner._def.typeName as keyof typeof ZOD_TO_SETTING;

  const base = {
    key,
    description: inner._def.description || '',
    filteredOut: false,
    type: ZOD_TO_SETTING[typeName] as SettingType,
    value: defaultValue,
  };

  return (
    typeName === 'ZodEnum' ? { ...base, selectOptions: inner._def.values } : base
  ) as IrisJsSettingChoice;
});

/** Rows with the shop's saved values layered over the schema defaults. */
export function irisJsSettingsWithValues(
  saved: Partial<IrisJsConfig> | null | undefined,
): IrisJsSettingChoice[] {
  return defaultIrisJsSettings.map(
    (row) =>
      ({
        ...row,
        value: saved?.[row.key] ?? row.value,
      }) as IrisJsSettingChoice,
  );
}
