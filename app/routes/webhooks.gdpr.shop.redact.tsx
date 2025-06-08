import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
    const { payload, topic } = await shopify(context).authenticate.webhook(request);

    console.log(`Received GDPR shop data erasure webhook for shop: ${payload.shop_domain}`);

    // Tu powinieneś zaimplementować logikę do usunięcia danych sklepu
    // Zgodnie z GDPR musisz usunąć wszystkie dane sklepu w ciągu 30 dni

    // Przykładowa implementacja:
    // 1. Znajdź wszystkie dane sklepu w Twojej bazie danych
    // 2. Usuń wszystkie dane związane ze sklepem
    // 3. Zachowaj logi audytu zgodnie z przepisami

    return new Response(null, { status: 200 });
}; 