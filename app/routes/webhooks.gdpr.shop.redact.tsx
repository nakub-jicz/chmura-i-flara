import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
    const { payload, topic, shop } = await shopify(context).authenticate.webhook(request);

    console.log(`Received ${topic} webhook for shop: ${shop}`);

    try {
        const shopId = payload.shop_id;
        const shopDomain = payload.shop_domain;

        if (!shopId || !shopDomain) {
            console.error("Missing shop information in redaction request");
            return new Response("Bad Request", { status: 400 });
        }

        console.log(`Processing shop data erasure for shop ${shopDomain} (ID: ${shopId})`);

        // According to GDPR, you must delete shop data within 30 days
        // Here you should implement the logic to delete shop-related data

        // Example implementation:
        // 1. Find all shop data in your database (sessions, settings, etc.)
        // 2. Delete the data (keep audit logs as required by law)
        // 3. Log the deletion for compliance tracking

        // Delete shop sessions and related data
        if (shopDomain) {
            await db(context.cloudflare.env.DATABASE_URL).session.deleteMany({
                where: { shop: shopDomain }
            });
        }

        // You might want to log this action for audit purposes
        // await db(context.cloudflare.env.DATABASE_URL).gdprAction.create({
        //     data: {
        //         action: 'shop_redact',
        //         shopDomain: shopDomain,
        //         shopifyShopId: shopId,
        //         completedAt: new Date()
        //     }
        // });

        console.log(`Shop data erasure completed for shop ${shopDomain}`);

        return new Response(null, { status: 200 });
    } catch (error) {
        console.error("Error processing shop redaction webhook:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}; 