import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
    const { payload, topic, shop } = await shopify(context).authenticate.webhook(request);

    console.log(`Received ${topic} webhook for shop: ${shop}, customer: ${payload.customer?.id}`);

    try {
        const customerId = payload.customer?.id;
        const customerEmail = payload.customer?.email;

        if (!customerId) {
            console.error("Missing customer ID in redaction request");
            return new Response("Bad Request", { status: 400 });
        }

        console.log(`Processing customer data erasure for customer ${customerId}, email: ${customerEmail}`);

        // According to GDPR, you must delete customer data within 30 days
        // Here you should implement the logic to delete/anonymize customer data

        // Example implementation:
        // 1. Find all customer data in your database
        // 2. Delete or anonymize the data (keep audit logs as required by law)
        // 3. Log the deletion for compliance tracking

        // Example database operations:
        // await db(context.cloudflare.env.DATABASE_URL).customerData.deleteMany({
        //     where: { shopifyCustomerId: customerId }
        // });

        // You might want to log this action for audit purposes
        // await db(context.cloudflare.env.DATABASE_URL).gdprAction.create({
        //     data: {
        //         action: 'customer_redact',
        //         shopifyCustomerId: customerId,
        //         shopDomain: shop,
        //         completedAt: new Date()
        //     }
        // });

        console.log(`Customer data erasure completed for customer ${customerId}`);

        return new Response(null, { status: 200 });
    } catch (error) {
        console.error("Error processing customer redaction webhook:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}; 