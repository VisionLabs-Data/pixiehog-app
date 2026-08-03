import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { ClientLoaderFunctionArgs} from "@remix-run/react";
import { isRouteErrorResponse, Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu, useAppBridge } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { useEffect } from "react";
import posthog from "posthog-js";
import { BlockStack, Box, Button, Card, InlineStack, Layout, Page, Text } from "@shopify/polaris";
import { serializeError } from "serialize-error";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export const clientLoader = async ({ request }: ClientLoaderFunctionArgs) => {
  return { apiKey: window.shopify.config.apiKey || "" };
};

function PosthogInit() {
  const shopify = useAppBridge();
  useEffect(() => {
    posthog.identify(
      posthog.get_distinct_id(), // Replace 'distinct_id' with your user's unique identifier
      { shop: shopify.config.shop } // optional: set additional person properties
    );
  }, []);
  return null;
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* Shopify renders these in the admin's own sidebar, so the app must not
          draw a nav of its own — see app/routes/preview.tsx for the standalone
          shell used when previewing outside the embed.

          App Bridge's NavMenu is flat: no groups, no headings. So the
          source/destination distinction has to be carried in the label itself,
          which is why they read "(source)" and "(destination)" rather than
          sitting under headings the way they do in the preview shell.

          Deliberately absent: /app/web-pixel-settings' PostHog SDK sibling
          (/app/js-web-posthog-settings) is a PostHog-only page, so it's reached
          from the PostHog destination rather than the top level. */}
      <NavMenu>
        <Link to="/app" rel="home">
          My Tracking
        </Link>
        <Link to="/app/web-pixel-settings">Shopify Web (source)</Link>
        <Link to="/app/destinations/posthog">PostHog (destination)</Link>
        <Link to="/app/destinations/iris">Iris (destination)</Link>
        <Link to="/app/custom-events">Custom Events</Link>
        <Link to="/app/real-time-activity">Real-Time Activity</Link>
        <Link to="/app/channel-accuracy">Channel Accuracy</Link>
        <Link to="/app/attribution-feed">Attribution Feed</Link>
        <Link to="/app/event-builder">Event Builder</Link>
        <Link to="/app/pre-built-tags">Pre-Built Tags</Link>
      </NavMenu>
      <Outlet />
      <PosthogInit/>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    if (!window.ENV.POSTHOG_API_KEY) {
      console.log('posthog disabled - no api key');
      return;
    }
    if (!posthog.__loaded) {
      posthog.init(window.ENV.POSTHOG_API_KEY, {
        api_host: window.ENV.POSTOHG_API_HOST,
        person_profiles: 'always',
        capture_pageleave: false,
        enable_recording_console_log: true,
        persistence: 'localStorage',
      });
    }
    if (error instanceof Error) {
      posthog.captureException(error, serializeError(error, {maxDepth: 4}))
    } else {
      posthog.captureException(Error('unknown error type'), serializeError(error, {maxDepth: 4}));
    }
  });

  const resolveError = (error:unknown) => {
    if (isRouteErrorResponse(error)) {
      return (
        <BlockStack>
           <Text 
            variant='bodyLg'
            as='p'>{error.status} {error.statusText}</Text>

            <Text 
            variant='bodyMd'
            as='p'>{error.data} {error.statusText}</Text>
        </BlockStack>
       
      );
    } else if (error instanceof Error) {
      return (
        <BlockStack>
          <Text 
          variant='bodyLg'
          as='p'>{error.name}</Text>

          <Text 
          variant='bodyMd'
          as='p'>{error.message}</Text>
          <Text 
          variant='bodySm'
          as='p'>{error.stack}</Text>
      </BlockStack>
      );
    } else {
      return (
        <BlockStack>
          <Text 
          variant='bodyLg'
          as='p'>Unknown Error</Text>

          <Text 
          variant='bodyMd'
          as='p'>{JSON.stringify(serializeError(error))}</Text>
      </BlockStack>
      )
    }
  }
  return (
    <AppProvider isEmbeddedApp apiKey={''}>
        <Page
          title="Error"
        >
          <BlockStack gap="500">
            <Layout>
              <Layout.Section>
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="500">
                    <InlineStack  align='space-between'>
                      <Text 
                        variant='headingLg'
                        as='h1'
                      >
                      An Error ocurred
                      </Text>
                    </InlineStack>

                      
                     {resolveError(error)}
             
                 
                    
                      <InlineStack  align='space-between'>
                        <Button variant='primary' url={'https://github.com/celadonworks/pixiehog-app'} target='_blank'>Submit GitHub Issue</Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                  
                </BlockStack>
              </Layout.Section>
            </Layout>
          </BlockStack>
          <Box paddingBlockEnd={'800'}></Box>
        </Page>
        </AppProvider>
    );
  
}
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};


