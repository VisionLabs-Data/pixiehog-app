import { ClockIcon } from '@shopify/polaris-icons';
import PlannedPage from '../../common/components/PlannedPage';

export default function RealTimeActivity() {
  return (
    <PlannedPage
      title="Real-Time Activity"
      subtitle="Live event stream from your storefront"
      icon={ClockIcon}
      purpose="A rolling feed of events as they arrive — which pixel fired, which destination accepted it, and the payload — so you can confirm a change works without waiting for a report."
      blockers={[
        'A read path back from PostHog. VizHog only writes today; nothing queries the project.',
        'A PostHog personal API key per shop (the project key it stores now is write-only).',
        'Delivery receipts from the Iris and Cloudflare worker legs, which currently log to their own consoles.',
      ]}
      action={{ content: 'Check pixel status', url: '/app/tracking' }}
    />
  );
}
