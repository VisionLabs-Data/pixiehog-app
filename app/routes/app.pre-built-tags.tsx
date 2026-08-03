import { CollectionIcon } from '@shopify/polaris-icons';
import PlannedPage from '../../common/components/PlannedPage';

export default function PreBuiltTags() {
  return (
    <PlannedPage
      title="Pre-Built Tags"
      subtitle="Downloadable GTM containers wired to your settings"
      icon={CollectionIcon}
      purpose="A GTM container export per destination, pre-configured with your IDs and the events you have switched on, so client-side tags match what VizHog sends server-side."
      blockers={[
        'A GTM container generator. Nothing in the app emits container JSON today.',
        'Only relevant for destinations with a client-side tag story — PostHog and Iris are both fed directly by the Web Pixel, so there is no GTM step to replace yet.',
      ]}
      action={{ content: 'Web Pixel settings', url: '/app/web-pixel-settings' }}
    />
  );
}
