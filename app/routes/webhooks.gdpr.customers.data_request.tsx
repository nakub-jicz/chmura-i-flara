import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
    const { payload, topic } = await shopify(context).authenticate.webhook(request);

    console.log(`Received GDPR customer data request webhook for customer: ${payload.customer?.id}`);

    // Tu powinieneś zaimplementować logikę do zebrania i przesłania danych klienta
    // Zgodnie z GDPR musisz przesłać wszystkie dane klienta w ciągu 30 dni

    // Przykładowa implementacja:
    // 1. Zbierz wszystkie dane klienta z Twojej bazy danych
    // 2. Przygotuj je w czytelnym formacie
    // 3. Wyślij je na adres email klienta lub udostępnij do pobrania

    return new Response(null, { status: 200 });
}; 