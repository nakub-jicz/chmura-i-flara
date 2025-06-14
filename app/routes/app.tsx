import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { shopify } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await shopify(context).authenticate.admin(request);

  const apiKey = context.cloudflare.env.SHOPIFY_API_KEY || "";

  console.log('Loader - API key available:', !!apiKey);
  console.log('Loader - API key length:', apiKey.length);

  return { apiKey };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  console.log('App Bridge configured with API key:', apiKey);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
