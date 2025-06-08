import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
    const { payload, topic } = await shopify(context).authenticate.webhook(request);

    console.log(`Received GDPR customer data erasure webhook for customer: ${payload.customer?.id}`);

    // Tu powinieneś zaimplementować logikę do usunięcia danych klienta
    // Zgodnie z GDPR musisz usunąć wszystkie dane klienta w ciągu 30 dni

    // Przykładowa implementacja:
    // 1. Znajdź wszystkie dane klienta w Twojej bazie danych
    // 2. Usuń lub zanonimizuj te dane
    // 3. Zachowaj logi audytu zgodnie z przepisami

    return new Response(null, { status: 200 });
}; 