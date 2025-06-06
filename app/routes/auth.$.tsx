import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await shopify(context).authenticate.admin(request);

  return null;
};
