import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
    const { payload, topic, shop } = await shopify(context).authenticate.webhook(request);

    console.log(`Received ${topic} webhook for shop: ${shop}, customer: ${payload.customer?.id}`);

    try {
        // Get customer data request details
        const customerDataRequest = payload.data_request;
        const customerId = payload.customer?.id;
        const customerEmail = payload.customer?.email;

        if (!customerDataRequest || !customerId) {
            console.error("Missing customer data request or customer ID");
            return new Response("Bad Request", { status: 400 });
        }

        // Log the data request for compliance tracking
        console.log(`GDPR Data Request ID: ${customerDataRequest.id}`);
        console.log(`Customer Email: ${customerEmail}`);

        // Here you should implement the logic to collect and send customer data
        // According to GDPR, you must provide customer data within 30 days

        // Example implementation steps:
        // 1. Query your database for all customer-related data
        // 2. Compile the data in a readable format (JSON, CSV, etc.)
        // 3. Send the data to the customer's email or provide a download link
        // 4. Log the completion for audit purposes

        // For now, we'll just log and acknowledge receipt
        console.log(`Processing customer data request for customer ${customerId}`);

        // You might want to store this request in your database for tracking
        // await db(context.cloudflare.env.DATABASE_URL).customerDataRequest.create({
        //     data: {
        //         shopifyCustomerId: customerId,
        //         shopDomain: shop,
        //         requestId: customerDataRequest.id,
        //         status: 'received',
        //         createdAt: new Date()
        //     }
        // });

        return new Response(null, { status: 200 });
    } catch (error) {
        console.error("Error processing customer data request webhook:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}; 