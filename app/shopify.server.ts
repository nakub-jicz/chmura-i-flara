import "@shopify/shopify-app-remix/adapters/node";
import "@shopify/shopify-api/adapters/cf-worker";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import type { AppLoadContext } from "@remix-run/cloudflare";

export const shopify = (context: AppLoadContext) =>
  shopifyApp({
    apiKey: context.cloudflare.env.SHOPIFY_API_KEY,
    apiSecretKey: context.cloudflare.env.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.October24,
    scopes: context.cloudflare.env.SCOPES?.split(","),
    appUrl: context.cloudflare.env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage: new PrismaSessionStorage(
      prisma(context.cloudflare.env.DATABASE_URL) as any,
    ),
    distribution: AppDistribution.AppStore,
    future: {
      unstable_newEmbeddedAuthStrategy: true,
      removeRest: true,
    },
    ...(context.cloudflare.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [context.cloudflare.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  });

export default shopify;
export const apiVersion = ApiVersion.October24;
