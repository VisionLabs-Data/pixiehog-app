import { TargetIcon } from '@shopify/polaris-icons';
import PlannedPage from '../../common/components/PlannedPage';

export default function ChannelAccuracy() {
  return (
    <PlannedPage
      title="Channel Accuracy"
      subtitle="How well each channel’s reported conversions match Shopify"
      icon={TargetIcon}
      purpose="A per-channel comparison of what the ad platforms claim against what Shopify actually recorded, so you can see where attribution is over- or under-counting."
      blockers={[
        'Ad platform credentials. VizHog connects to no ad accounts — there is nothing to compare Shopify against.',
        'An order-level attribution store. Orders are forwarded and forgotten; none are retained for reconciliation.',
        'A decision on the attribution window and model to reconcile on.',
      ]}
    />
  );
}
