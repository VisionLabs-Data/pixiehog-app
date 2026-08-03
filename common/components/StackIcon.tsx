/**
 * Polaris `<Icon>` as a flex child, aligned where you asked.
 *
 * `.Polaris-Icon` sets `margin: auto`. Auto margins absorb a flex line's free
 * space BEFORE `justify-content` is applied, so a bare <Icon> inside an
 * <InlineStack> lands centred in the leftover space instead of at the end —
 * and, next to a label, shoves that label to the far edge. Wrapping it in a
 * box exactly the icon's width leaves nothing for the auto margins to absorb.
 *
 * Use this anywhere an Icon is a direct child of InlineStack.
 */
import { Box, Icon } from '@shopify/polaris';
import type { IconProps } from '@shopify/polaris';

/** Polaris renders icons at 20px (--p-icon-size-small). */
const ICON_BOX = '20px';

export default function StackIcon(props: IconProps) {
  return (
    <Box width={ICON_BOX}>
      <Icon {...props} />
    </Box>
  );
}
