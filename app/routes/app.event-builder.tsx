import { CodeIcon } from '@shopify/polaris-icons';
import PlannedPage from '../../common/components/PlannedPage';

export default function EventBuilder() {
  return (
    <PlannedPage
      title="Event Builder"
      subtitle="Define your own events without changing the pixel"
      icon={CodeIcon}
      purpose="A rule builder for events VizHog doesn’t ship — pick a trigger (a page, a click, a cart condition), name the event, choose which destinations receive it."
      blockers={[
        'A rules store. The pixel reads a fixed settings object from a metafield; it has no rule interpreter.',
        'A Web Pixel change to evaluate rules at runtime, which means an extension version bump.',
        'Validation, so a bad rule can’t break the whole pixel for the storefront.',
      ]}
      action={{ content: 'Current event catalog', url: '/app/custom-events' }}
    />
  );
}
