/**
 * Honest placeholder for a nav destination that exists in the shell but has no
 * data behind it yet.
 *
 * Deliberately shows no charts, counts, or sample rows — a fake dashboard is
 * worse than an empty one, because a merchant can't tell it's fake.
 */
import type { ReactNode } from 'react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineStack,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import type { IconSource } from '@shopify/polaris';

export interface PlannedPageProps {
  title: string;
  /** One line on what the page is for. Shown under the title. */
  subtitle: string;
  icon: IconSource;
  /** What it would show once the data exists. */
  purpose: ReactNode;
  /** Concrete things that have to be built first. */
  blockers: string[];
  /** The nearest thing that does work today, if there is one. */
  action?: { content: string; url: string };
}

export default function PlannedPage({
  title,
  subtitle,
  icon,
  purpose,
  blockers,
  action,
}: PlannedPageProps) {
  return (
    <Page title={title} subtitle={subtitle} titleMetadata={<Badge>Not available yet</Badge>}>
      <Card>
        <Box padding="400">
          <BlockStack gap="500">
            <InlineStack gap="300" blockAlign="center">
              <Icon source={icon} tone="subdued" />
              <Text as="h2" variant="headingMd">
                Nothing to show here yet
              </Text>
            </InlineStack>

            <Text as="p" tone="subdued">
              {purpose}
            </Text>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                What this needs first
              </Text>
              <List type="bullet">
                {blockers.map((b) => (
                  <List.Item key={b}>{b}</List.Item>
                ))}
              </List>
            </BlockStack>

            {action && (
              <InlineStack>
                <Button url={action.url}>{action.content}</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
