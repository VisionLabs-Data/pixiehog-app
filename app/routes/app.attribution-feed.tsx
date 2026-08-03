import { ChartVerticalIcon } from '@shopify/polaris-icons';
import PlannedPage from '../../common/components/PlannedPage';

export default function AttributionFeed() {
  return (
    <PlannedPage
      title="Attribution Feed"
      subtitle="Order-by-order view of the touchpoints that led to each sale"
      icon={ChartVerticalIcon}
      purpose="Each order with its full click path — first touch, last touch, and the session that converted — exportable for your own modelling."
      blockers={[
        'Persisted sessions. The Web Pixel sends events straight to PostHog and Iris; the app stores none of them.',
        'A read path back from PostHog to stitch sessions to orders.',
        'A retention policy — click paths are customer data and fall under the app’s protected-data scopes.',
      ]}
      action={{ content: 'See what’s being sent', url: '/app/custom-events' }}
    />
  );
}
