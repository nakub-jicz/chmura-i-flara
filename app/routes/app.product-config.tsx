// app/routes/app.product-config.tsx
import React, { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Checkbox,
  Text,
  BlockStack,
  Thumbnail,
  Spinner,
  Banner,
  InlineStack,
  Badge,
  Icon,
  Divider,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText,
  Box,
  FormLayout,
  ButtonGroup,
} from "@shopify/polaris";
import {
  ProductIcon,
  AlertTriangleIcon,
  CheckIcon,
  ExternalIcon,
  SettingsIcon,
  ThemeIcon,
  LinkIcon,
  EditIcon,
  ViewIcon,
  ArrowLeftIcon,
  PlusIcon,
  DeleteIcon,
} from '@shopify/polaris-icons';

// Aktualizowana implementacja zgodna z App Bridge React 4.x
import { useAppBridge } from "@shopify/app-bridge-react";

import { shopify } from "../shopify.server";

// GraphQL Response types
interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

interface ProductQueryResponse {
  product: {
    id: string;
    title: string;
    handle: string;
    featuredImage?: {
      url: string;
      altText?: string;
    };
    metafields: {
      nodes: Array<{
        id: string;
        namespace: string;
        key: string;
        value: string;
        type: string;
      }>;
    };
  };
}

interface MetafieldsQueryResponse {
  product: {
    metafields: {
      nodes: Array<{
        id: string;
        key: string;
      }>;
    };
  };
}

interface MetafieldsDeleteResponse {
  metafieldsDelete: {
    deletedMetafields: Array<{
      key: string;
      namespace: string;
      ownerId: string;
    }>;
    userErrors: Array<{
      field?: string[];
      message: string;
    }>;
  };
}

interface ProductUpdateResponse {
  productUpdate: {
    product: {
      id: string;
      title: string;
      metafields: {
        nodes: Array<{
          id: string;
          namespace: string;
          key: string;
          value: string;
          type: string;
        }>;
      };
    };
    userErrors: Array<{
      field?: string[];
      message: string;
    }>;
  };
}

// Enhanced App Bridge types - using type assertion approach to avoid conflicts

// Type definitions
interface ExternalLink {
  url: string;
  text: string;
  enabled: boolean;
}

interface Product {
  id: string;
  title: string;
  handle: string;
  featuredImage?: {
    url: string;
    altText?: string;
  };
  externalLinks: ExternalLink[];
  hideAtc: boolean;
}

interface LoaderData {
  initialLoad?: boolean;
  product?: Product | null;
  message?: string | null;
  errors?: Array<{ message: string; field?: string[] }>;
  error?: string;
  themeEditorUrl?: string;
  shopDomain?: string;
}

interface ActionData {
  errors?: Array<{ message: string; field?: string[] }>;
  message?: string | null;
}

interface Metafield {
  id: string;
  namespace: string;
  key: string;
  value: string;
  type: string;
}

// Stałe dla metafields
const METAFIELD_NAMESPACE = "bl_custom_button";
const METAFIELD_KEY_LINKS = "external_links"; // JSON array linków  
const METAFIELD_KEY_HIDE_ATC = "hide_atc"; // boolean czy ukryć Add to Cart

// Funkcja loader - ładuje dane produktu z metafields
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await shopify(context).authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  // Pobierz dane o aktywnym motywie
  let themeEditorUrl = `https://${session.shop}/admin/themes`;
  console.log("Theme editor URL set to:", themeEditorUrl);

  if (!productId) {
    return json({
      initialLoad: true,
      product: null,
      message: null,
      errors: [],
      themeEditorUrl,
      shopDomain: session.shop
    });
  }

  try {
    // Pobierz dane produktu wraz z metafields
    const productQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          featuredImage {
            url
            altText
          }
          metafields(first: 10, namespace: "${METAFIELD_NAMESPACE}") {
            nodes {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
    `;

    const response = await admin.graphql(productQuery, {
      variables: { id: productId }
    });

    const responseJson = (await response.json()) as any;

    if (responseJson.errors) {
      console.error("GraphQL errors:", responseJson.errors);
      return json({
        error: "Failed to load product data: " + responseJson.errors[0].message,
        product: null,
        message: null,
        errors: [],
        themeEditorUrl,
        shopDomain: session.shop
      });
    }

    const product = responseJson.data?.product;

    if (!product) {
      return json({
        error: "Product not found",
        product: null,
        message: null,
        errors: [],
        themeEditorUrl,
        shopDomain: session.shop
      });
    }

    // Przetwórz metafields
    const metafields: Metafield[] = product.metafields?.nodes || [];
    const metafieldMap: Record<string, string> = {};

    metafields.forEach((mf: Metafield) => {
      metafieldMap[mf.key] = mf.value;
    });

    console.log("Loaded metafields:", metafieldMap);

    // Parse external links - support both old and new format
    let externalLinks: ExternalLink[] = [];

    // Try new format first (external_links JSON)
    if (metafieldMap[METAFIELD_KEY_LINKS]) {
      try {
        externalLinks = JSON.parse(metafieldMap[METAFIELD_KEY_LINKS]);
        console.log("Using new format (external_links JSON):", externalLinks);
      } catch (error) {
        console.error("Error parsing external links JSON:", error);
        externalLinks = [];
      }
    }
    // Fallback to old format (individual metafields)
    else if (metafieldMap['external_url'] || metafieldMap['button_text']) {
      console.log("Using old format (individual metafields)");
      const legacyLink: ExternalLink = {
        url: metafieldMap['external_url'] || "",
        text: metafieldMap['button_text'] || "",
        enabled: metafieldMap['is_enabled'] === "true"
      };

      // Only add if both URL and text exist
      if (legacyLink.url && legacyLink.text) {
        externalLinks = [legacyLink];
        console.log("Converted legacy format to:", externalLinks);
      }
    }

    const productData: Product = {
      id: product.id,
      title: product.title,
      handle: product.handle,
      featuredImage: product.featuredImage,
      externalLinks: externalLinks,
      hideAtc: metafieldMap[METAFIELD_KEY_HIDE_ATC] === "true" || metafieldMap['hide_atc'] === "true"
    };

    console.log("Product data:", productData);

    return json({
      product: productData,
      message: null,
      errors: [],
      initialLoad: false,
      themeEditorUrl,
      shopDomain: session.shop
    });

  } catch (error: any) {
    console.error("Error in loader:", error);
    return json({
      error: "Failed to load product: " + error.message,
      product: null,
      message: null,
      errors: [],
      themeEditorUrl,
      shopDomain: session.shop
    });
  }
};

// Funkcja action - zapisuje ustawienia metafields
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin } = await shopify(context).authenticate.admin(request);

  try {
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const productId = formData.get("productId");

    if (!productId) {
      return json({
        errors: [{ message: "Product ID is required" }],
        message: null
      });
    }

    // Handle regular save action
    const externalLinksJson = formData.get("externalLinks") || "[]";
    const hideAtc = formData.get("hideAtc") === "on";

    // Parse external links
    let externalLinks: ExternalLink[] = [];
    try {
      externalLinks = JSON.parse(externalLinksJson as string);
    } catch (error) {
      console.error("Error parsing external links:", error);
      return json({
        errors: [{ message: "Invalid external links data" }],
        message: null
      });
    }

    console.log("Form data received:", {
      productId,
      externalLinks,
      hideAtc
    });

    // Walidacja
    const errors: Array<{ message: string; field?: string[] }> = [];

    // Validate each link (tylko jeśli są linki)
    externalLinks.forEach((link: ExternalLink, index: number) => {
      if (!link.url || !link.url.trim()) {
        errors.push({ field: [`externalLinks[${index}].url`], message: `URL is required for link ${index + 1}` });
      }
      if (!link.text || !link.text.trim()) {
        errors.push({ field: [`externalLinks[${index}].text`], message: `Button text is required for link ${index + 1}` });
      }
      if (link.url && !link.url.match(/^https?:\/\//)) {
        errors.push({ field: [`externalLinks[${index}].url`], message: `URL for link ${index + 1} must start with http:// or https://` });
      }
    });

    if (errors.length > 0) {
      return json({ errors, message: null });
    }

    // Sprawdź czy są jakieś linki do zapisania
    const hasLinksToSave = externalLinks.length > 0;

    console.log("Has links to save:", hasLinksToSave);

    // Pobierz istniejące metafields
    const getMetafieldsQuery = `
      query getProductMetafields($id: ID!) {
        product(id: $id) {
          metafields(first: 20, namespace: "${METAFIELD_NAMESPACE}") {
            nodes {
              id
              key
            }
          }
        }
      }
    `;

    const metafieldsResponse = await admin.graphql(getMetafieldsQuery, {
      variables: { id: productId }
    });

    const metafieldsData = (await metafieldsResponse.json()) as any;
    const existingMetafields: Array<{ id: string; key: string }> = metafieldsData.data?.product?.metafields?.nodes || [];

    // Jeśli nie ma linków do zapisania, usuń wszystkie metafields i zakończ
    if (!hasLinksToSave) {
      if (existingMetafields.length > 0) {
        const deleteAllMetafieldsMutation = `
          mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
            metafieldsDelete(metafields: $metafields) {
              deletedMetafields {
                key
                namespace
                ownerId
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const allMetafieldIdentifiers = existingMetafields.map((mf: { id: string; key: string }) => ({
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE,
          key: mf.key
        }));
        console.log(`Deleting all metafields (no links to save):`, existingMetafields.map((mf: { key: string }) => mf.key));

        const deleteResponse = await admin.graphql(deleteAllMetafieldsMutation, {
          variables: {
            metafields: allMetafieldIdentifiers
          }
        });

        const deleteData = (await deleteResponse.json()) as any;
        console.log(`Deleted all metafields:`, deleteData);

        const userErrors = deleteData.data?.metafieldsDelete?.userErrors || [];
        if (userErrors.length > 0) {
          console.error("Delete errors:", userErrors);
          return json({
            errors: userErrors,
            message: null
          });
        }
      }

      console.log("Product configuration removed successfully!");
      return json({
        errors: [],
        message: "Product configuration removed successfully! The product will no longer appear in the configured products list."
      });
    }

    // Jeśli są linki do zapisania, kontynuuj z zapisywaniem metafields
    // Przygotuj metafields
    const metafieldsInput = [];

    // External links as JSON
    metafieldsInput.push({
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY_LINKS,
      value: JSON.stringify(externalLinks),
      type: "json"
    });

    // Hide ATC boolean
    metafieldsInput.push({
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY_HIDE_ATC,
      value: hideAtc ? "true" : "false",
      type: "boolean"
    });

    console.log("Metafields to save:", metafieldsInput);

    // Delete old format metafields (external_url, button_text, is_enabled)
    const oldFormatKeys = ['external_url', 'button_text', 'is_enabled'];
    const oldFormatMetafields = existingMetafields.filter((mf: { key: string }) => oldFormatKeys.includes(mf.key));

    if (oldFormatMetafields.length > 0) {
      const deleteOldMetafieldsMutation = `
        mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            deletedMetafields {
              key
              namespace
              ownerId
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const oldMetafieldIdentifiers = oldFormatMetafields.map((mf: { key: string }) => ({
        ownerId: productId,
        namespace: METAFIELD_NAMESPACE,
        key: mf.key
      }));
      console.log(`Deleting old format metafields:`, oldFormatMetafields.map((mf: { key: string }) => mf.key));

      const deleteResponse = await admin.graphql(deleteOldMetafieldsMutation, {
        variables: {
          metafields: oldMetafieldIdentifiers
        }
      });

      const deleteData = (await deleteResponse.json()) as any;
      console.log(`Deleted old metafields:`, deleteData);
    }

    // Mutation do zapisania metafields
    const updateMutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            metafields(first: 10, namespace: "${METAFIELD_NAMESPACE}") {
              nodes {
                id
                namespace
                key
                value
                type
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(updateMutation, {
      variables: {
        input: {
          id: productId,
          metafields: metafieldsInput
        }
      }
    });

    const responseJson = (await response.json()) as any;

    console.log("GraphQL response:", JSON.stringify(responseJson, null, 2));

    if (responseJson.errors) {
      console.error("GraphQL errors:", responseJson.errors);
      return json({
        errors: [{ message: "Failed to save settings: " + responseJson.errors[0].message }],
        message: null
      });
    }

    const userErrors = responseJson.data?.productUpdate?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("User errors:", userErrors);
      return json({
        errors: userErrors,
        message: null
      });
    }

    console.log("Settings saved successfully!");
    return json({
      errors: [],
      message: "Settings saved successfully!"
    });

  } catch (error: any) {
    console.error("Error in action:", error);
    return json({
      errors: [{ message: "Failed to save settings: " + error.message }],
      message: null
    });
  }
};

export default function ProductConfigPage() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const currentProduct = loaderData?.product;
  const initialFeedback = loaderData?.message;
  const initialErrors = loaderData?.errors || [];
  const themeEditorUrl = loaderData?.themeEditorUrl || "#";
  const shopDomain = loaderData?.shopDomain || "";

  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>(currentProduct?.externalLinks || []);
  const [hideAtc, setHideAtc] = useState<boolean>(currentProduct?.hideAtc || false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoadingPicker, setIsLoadingPicker] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(initialFeedback || null);
  const [formErrors, setFormErrors] = useState<Array<{ message: string; field?: string[] }>>(initialErrors);

  const submit = useSubmit();
  const navigate = useNavigate();
  const location = typeof window !== 'undefined' ? window.location : { search: '' };

  // App Bridge setup
  const shopify = useAppBridge();

  // Disable unsaved changes after successful save
  useEffect(() => {
    if (actionData?.message && (!actionData?.errors || actionData.errors.length === 0)) {
      // Successful save - disable unsaved changes and hide save bar
      const shopifyExtended = shopify as any;
      if (shopifyExtended?.features?.unsavedChanges) {
        shopifyExtended.features.unsavedChanges.disable();
      }
      const saveBarAPI = shopifyExtended?.features?.saveBar || shopifyExtended?.saveBar;
      if (saveBarAPI) {
        saveBarAPI.hide();
      }
      setIsSaving(false);
    }
  }, [actionData, shopify]);

  // Update form errors from action data
  useEffect(() => {
    if (actionData?.errors) {
      setFormErrors(actionData.errors);
    }
    if (actionData?.message) {
      setFeedbackMessage(actionData.message);
    }
  }, [actionData]);

  // Helper function to check if form has changes
  const hasUnsavedChanges = useCallback((): boolean => {
    if (!currentProduct) return false;

    return (
      JSON.stringify(externalLinks) !== JSON.stringify(currentProduct.externalLinks || []) ||
      hideAtc !== (currentProduct.hideAtc || false)
    );
  }, [currentProduct, externalLinks, hideAtc]);

  // App Bridge unsaved changes integration
  useEffect(() => {
    const shopifyExtended = shopify as any;
    if (shopifyExtended?.features?.unsavedChanges) {
      if (hasUnsavedChanges()) {
        shopifyExtended.features.unsavedChanges.enable();
      } else {
        shopifyExtended.features.unsavedChanges.disable();
      }
    }
  }, [shopify, hasUnsavedChanges]);

  // App Bridge save bar integration
  useEffect(() => {
    if (shopify && currentProduct) {
      // Try to use saveBar if available, otherwise try saveBar API
      const saveBarAPI = shopify.features?.saveBar || (shopify as any).saveBar;

      if (saveBarAPI) {
        if (hasUnsavedChanges()) {
          saveBarAPI.show({
            saveAction: {
              label: isSaving ? "Saving..." : "Save Settings",
              loading: isSaving,
              disabled: isSaving || (externalLinks.length > 0 && !externalLinks.some((link: ExternalLink) => link.url && link.text)),
              onAction: () => {
                const form = document.querySelector('[data-save-bar]') as HTMLFormElement;
                if (form) {
                  const event = new Event('submit', { bubbles: true, cancelable: true });
                  form.dispatchEvent(event);
                }
              }
            },
            discardAction: {
              label: "Discard",
              onAction: () => {
                if (currentProduct) {
                  setExternalLinks(currentProduct.externalLinks || []);
                  setHideAtc(currentProduct.hideAtc || false);
                }
                if (shopify?.features?.unsavedChanges) {
                  shopify.features.unsavedChanges.disable();
                }
                saveBarAPI.hide();
                shopify?.toast?.show("Changes discarded", { duration: 2000 });
              }
            }
          });
        } else {
          saveBarAPI.hide();
        }
      } else {
        console.log("SaveBar API not available in this App Bridge version");
      }
    }
  }, [shopify, currentProduct, hasUnsavedChanges, isSaving, externalLinks]);

  // Safe navigation function that blocks when there are unsaved changes
  const safeNavigate = useCallback((path: string) => {
    if (hasUnsavedChanges()) {
      // Show toast for button clicks - App Bridge handles browser navigation
      shopify?.toast?.show("You have unsaved changes. Please save or discard them first.", {
        isError: true,
        duration: 4000
      });
      return;
    }
    navigate(path);
  }, [hasUnsavedChanges, navigate, shopify]);

  // Clear feedback message after some time
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => {
        setFeedbackMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  // Update form fields when currentProduct changes
  useEffect(() => {
    if (currentProduct) {
      setExternalLinks(currentProduct.externalLinks || []);
      setHideAtc(currentProduct.hideAtc || false);
    } else {
      // Reset form when no product is selected
      setExternalLinks([]);
      setHideAtc(false);
    }
  }, [currentProduct]);

  // Functions to manage external links array
  const addExternalLink = useCallback(() => {
    setExternalLinks(prev => [...prev, { url: "", text: "", enabled: true }]);
  }, []);

  const removeExternalLink = useCallback((index: number) => {
    setExternalLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Preview product function
  const handlePreviewProduct = useCallback(() => {
    if (currentProduct && shopDomain) {
      const previewUrl = `https://${shopDomain}/products/${currentProduct.handle}`;
      window.open(previewUrl, '_blank');
      shopify?.toast?.show(`Opening preview: ${currentProduct.title}`, { duration: 2000 });
    }
  }, [currentProduct, shopDomain, shopify]);

  const updateExternalLink = useCallback((index: number, field: keyof ExternalLink, value: string | boolean) => {
    setExternalLinks(prev =>
      prev.map((link, i) =>
        i === index ? { ...link, [field]: value } : link
      )
    );
  }, []);

  // Nowa implementacja ResourcePicker zgodna z App Bridge API 4.x
  const handleOpenProductPicker = useCallback(async () => {
    if (isLoadingPicker) {
      return;
    }

    setIsLoadingPicker(true);
    try {
      // Pokaż toast o rozpoczęciu wyboru
      shopify?.toast?.show("Opening product picker...", { duration: 2000 });

      const picker = await (shopify as any).resourcePicker({
        type: "product",
        multiple: false,
        showVariants: false,
      });

      if (picker && picker.selection && picker.selection.length > 0) {
        const selected = picker.selection[0];
        console.log("Selected product:", selected);

        // Pokaż toast o pomyślnym wyborze
        shopify?.toast?.show(`Selected: ${selected.title}`, { duration: 3000 });

        // Przekieruj do konfiguracji tego produktu
        navigate(`/app/product-config?productId=${selected.id}`, { replace: true });
      } else {
        shopify?.toast?.show("No product selected", { duration: 2000 });
      }
    } catch (error) {
      console.error("Error selecting product:", error);
      shopify?.toast?.show("Error selecting product", {
        isError: true,
        duration: 4000
      });
    } finally {
      setIsLoadingPicker(false);
    }
  }, [shopify, navigate, isLoadingPicker]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentProduct) {
      setFormErrors([{ message: "Please select a product first." }]);
      shopify?.toast?.show("Please select a product first!", { isError: true, duration: 3000 });
      return;
    }

    setIsSaving(true);
    setFormErrors([]); // Clear previous errors
    shopify?.toast?.show("Saving settings...", { duration: 2000 });

    const formData = new FormData(event.currentTarget);
    formData.set("actionType", "save");
    formData.set("productId", currentProduct.id);
    formData.set("externalLinks", JSON.stringify(externalLinks));
    formData.set("hideAtc", hideAtc ? "on" : "off");

    // Debug: log form data
    console.log("Submitting form with data:");
    for (let [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    }
    console.log("Current state:");
    console.log(`externalLinks:`, externalLinks);
    console.log(`hideAtc: ${hideAtc}`);

    submit(formData, { method: "post", action: `/app/product-config${location.search}` });

    // Reset saving state po krótkim czasie
    setTimeout(() => setIsSaving(false), 2000);
  };

  const displayErrors = formErrors && formErrors.length > 0
    ? formErrors.map((err, index) => (
      <Banner key={index} tone="critical">
        {err.field ? `${err.field.join(", ")}: ` : ""} {err.message}
      </Banner>
    ))
    : null;

  const displayFeedback = feedbackMessage && (!formErrors || formErrors.length === 0)
    ? (
      <Banner tone="success" icon={CheckIcon}>
        {feedbackMessage}
      </Banner>
    )
    : null;

  // Loading skeleton dla produktu
  const ProductSkeleton = () => (
    <Card>
      <BlockStack gap="400">
        <SkeletonDisplayText size="medium" />
        <SkeletonBodyText lines={3} />
      </BlockStack>
    </Card>
  );

  return (
    <Page
      title="Product Configuration"
      titleMetadata={
        <InlineStack gap="200">
          {currentProduct ? <Badge tone="success" icon={CheckIcon}>Product selected</Badge> : <Badge icon={ProductIcon}>Select product</Badge>}
          {isSaving && <Badge tone="info">Saving...</Badge>}
        </InlineStack>
      }
      primaryAction={{
        content: isLoadingPicker ? "Selecting..." : "Select Product",
        onAction: () => {
          if (hasUnsavedChanges()) {
            // Show toast for button clicks - App Bridge handles browser navigation
            shopify?.toast?.show("You have unsaved changes. Please save or discard them first.", {
              isError: true,
              duration: 4000
            });
            return;
          }
          handleOpenProductPicker();
        },
        loading: isLoadingPicker,
        disabled: isLoadingPicker,
        icon: ProductIcon
      }}
      secondaryActions={[
        {
          content: "Back to Dashboard",
          onAction: () => safeNavigate("/app"),
          icon: ArrowLeftIcon
        },
        ...(currentProduct ? [{
          content: "Preview Product",
          onAction: handlePreviewProduct,
          icon: ViewIcon
        }, {
          content: "Select different product",
          onAction: () => {
            if (hasUnsavedChanges()) {
              // Show toast for button clicks - App Bridge handles browser navigation
              shopify?.toast?.show("You have unsaved changes. Please save or discard them first.", {
                isError: true,
                duration: 4000
              });
              return;
            }
            handleOpenProductPicker();
          },
          disabled: isLoadingPicker,
          icon: ProductIcon
        }] : [])
      ]}
    >
      <Layout>
        {/* Instrukcja dla nowych użytkowników */}
        {!currentProduct && !loaderData?.error && (
          <Layout.Section>
            <Banner title="How to configure external links" tone="info" icon={SettingsIcon}>
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  This app allows you to add external link buttons (e.g., affiliate links) to your product pages.
                </Text>
                <BlockStack gap="200">
                  <Text as="p">
                    <strong>1. Select product</strong> - Click "Select Product" button above
                  </Text>
                  <Text as="p">
                    <strong>2. Configure link</strong> - Add destination URL and button text
                  </Text>
                  <Text as="p">
                    <strong>3. Enable feature</strong> - Check the checkbox to activate the button
                  </Text>
                  <Text as="p">
                    <strong>4. Button appears automatically</strong> - The external button will show on your product page
                  </Text>
                  <Text as="p" tone="subdued">
                    Optional: Use theme editor to customize the button appearance and position
                  </Text>
                </BlockStack>
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

        {/* Status błędu */}
        {(loaderData?.error || displayErrors || displayFeedback) && (
          <Layout.Section>
            {loaderData?.error && !currentProduct && (
              <Banner tone="critical" icon={AlertTriangleIcon}>
                <Text as="p">{loaderData.error}</Text>
              </Banner>
            )}
            {displayErrors}
            {displayFeedback}
          </Layout.Section>
        )}

        {/* Ładowanie produktu */}
        {isLoadingPicker && (
          <Layout.Section>
            <ProductSkeleton />
          </Layout.Section>
        )}

        {/* Konfiguracja produktu */}
        {currentProduct ? (
          <Layout.Section>
            <Card>
              <form
                data-save-bar
                data-discard-confirmation
                onSubmit={handleSubmit}
                onReset={() => {
                  if (currentProduct) {
                    setExternalLinks(currentProduct.externalLinks || []);
                    setHideAtc(currentProduct.hideAtc || false);
                  }
                  // Disable unsaved changes after reset
                  if (shopify?.features?.unsavedChanges) {
                    shopify.features.unsavedChanges.disable();
                  }
                  shopify?.toast?.show("Changes discarded", { duration: 2000 });
                }}
              >
                <input type="hidden" name="actionType" value="save" />
                <input type="hidden" name="productId" value={currentProduct.id} />
                <input type="hidden" name="externalLinks" value={JSON.stringify(externalLinks)} />
                <input type="hidden" name="hideAtc" value={hideAtc ? "on" : "off"} />

                <BlockStack gap="200">
                  {/* Header produktu */}
                  <Card>
                    <InlineStack align="space-between" blockAlign="start" gap="400">
                      <BlockStack gap="300">
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={ProductIcon} tone="base" />
                          <Text variant="headingLg" as="h2">
                            {currentProduct.title}
                          </Text>
                        </InlineStack>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Product ID: {currentProduct.id.replace('gid://shopify/Product/', '')}
                        </Text>
                      </BlockStack>
                      {currentProduct.featuredImage && (
                        <Thumbnail
                          source={currentProduct.featuredImage.url}
                          alt={currentProduct.featuredImage.altText || ""}
                          size="large"
                        />
                      )}
                    </InlineStack>
                  </Card>

                  {/* External Links Settings */}
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingMd" as="h3">External links</Text>
                        <Button
                          onClick={addExternalLink}
                          icon={PlusIcon}
                          variant="primary"
                          size="medium"
                        >
                          Add Link
                        </Button>
                      </InlineStack>

                      {externalLinks.length === 0 ? (
                        <EmptyState
                          heading="No external links configured"
                          action={{
                            content: "Add your first link",
                            onAction: addExternalLink,
                            icon: PlusIcon
                          }}
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <Text as="p" variant="bodyMd">
                            Add external links (e.g., affiliate links) that will appear as buttons on your product page.
                          </Text>
                        </EmptyState>
                      ) : (
                        <BlockStack gap="400">
                          {externalLinks.map((link: ExternalLink, index: number) => (
                            <Card key={index}>
                              <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodyLg" fontWeight="semibold" as="h4">
                                    Link {index + 1}
                                  </Text>
                                  <Button
                                    onClick={() => removeExternalLink(index)}
                                    icon={DeleteIcon}
                                    variant="plain"
                                    tone="critical"
                                    size="medium"
                                  >
                                    Remove
                                  </Button>
                                </InlineStack>

                                <FormLayout>
                                  <TextField
                                    label="Destination URL"
                                    value={link.url || ""}
                                    onChange={(value) => updateExternalLink(index, "url", value)}
                                    autoComplete="off"
                                    placeholder="https://amazon.com/product/..."
                                    helpText="Full URL of the page where the button should redirect"
                                    connectedLeft={<Icon source={LinkIcon} />}
                                  />

                                  <TextField
                                    label="Button text"
                                    value={link.text || ""}
                                    onChange={(value) => updateExternalLink(index, "text", value)}
                                    autoComplete="off"
                                    placeholder="Buy on Amazon"
                                    helpText="Text displayed on the button"
                                    connectedLeft={<Icon source={EditIcon} />}
                                  />

                                  <Checkbox
                                    label="Enable this button"
                                    checked={link.enabled !== false}
                                    onChange={(checked) => updateExternalLink(index, "enabled", checked)}
                                    helpText="When enabled, this button will be visible on the product page"
                                  />
                                </FormLayout>
                              </BlockStack>
                            </Card>
                          ))}
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>

                  {/* Display Options */}
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3">Display options</Text>

                      <BlockStack gap="400">
                        <Checkbox
                          label="Hide original 'Add to cart' button (experimental)"
                          name="hideAtc"
                          checked={hideAtc}
                          onChange={(checked) => setHideAtc(checked)}
                          helpText="WARNING: This feature may not work with all themes. Test before publishing."
                        />
                      </BlockStack>
                    </BlockStack>
                  </Card>

                  {/* Configuration Preview */}
                  {externalLinks.length > 0 && externalLinks.some((link: ExternalLink) => link.enabled !== false) && (
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" fontWeight="semibold" as="h3">Configuration preview</Text>
                        <InlineStack gap="300" blockAlign="center" align="start">
                          <Badge tone="success">Enabled</Badge>
                          <Text variant="bodyLg" as="p">
                            {externalLinks.filter((link: ExternalLink) => link.enabled !== false).length} button(s) configured
                          </Text>
                        </InlineStack>
                        <BlockStack gap="300" align="start">
                          {externalLinks.map((link: ExternalLink, index: number) => (
                            link.enabled !== false && link.url && link.text ? (
                              <Card key={index} padding="300" background="bg-surface-secondary">
                                <BlockStack gap="200" align="start">
                                  <InlineStack gap="200" blockAlign="center" align="start">
                                    <Badge tone="info">{(index + 1).toString()}</Badge>
                                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                                      "{link.text}"
                                    </Text>
                                    <Button
                                      variant="plain"
                                      size="micro"
                                      icon={ExternalIcon}
                                      onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                                      accessibilityLabel={`Open ${link.text} in new tab`}
                                    />
                                  </InlineStack>
                                  <Text variant="bodyMd" tone="subdued" breakWord as="p">
                                    {link.url.length > 60 ? `${link.url.substring(0, 60)}...` : link.url}
                                  </Text>
                                </BlockStack>
                              </Card>
                            ) : null
                          ))}
                        </BlockStack>
                        {hideAtc && (
                          <InlineStack gap="200" blockAlign="center" align="start">
                            <Badge tone="warning">Warning</Badge>
                            <Text tone="subdued" as="span">"Add to cart" button will be hidden</Text>
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Card>
                  )}

                  {/* Action buttons */}
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack gap="300" align="start">
                        <Button
                          submit
                          variant="primary"
                          loading={isSaving}
                          disabled={isSaving || (externalLinks.length > 0 && !externalLinks.some((link: ExternalLink) => link.url && link.text))}
                          icon={CheckIcon}
                        >
                          {isSaving ? "Saving..." : "Save Settings"}
                        </Button>
                      </InlineStack>

                      {/* Theme editor instruction */}
                      <Banner tone="info" icon={ThemeIcon}>
                        <BlockStack gap="300">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            Optional: Customize your button appearance
                          </Text>
                          <Text variant="bodyMd" as="p">
                            The button appears automatically on your product pages. To customize its style or position, use the theme editor:
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <TextField
                              value={themeEditorUrl}
                              readOnly
                              autoComplete="off"
                              connectedRight={
                                <Button
                                  onClick={() => {
                                    navigator.clipboard.writeText(themeEditorUrl);
                                    shopify?.toast?.show("Link copied to clipboard!", { duration: 2000 });
                                  }}
                                  icon={ThemeIcon}
                                >
                                  Copy
                                </Button>
                              }
                            />
                          </InlineStack>
                          <Text variant="bodyMd" tone="subdued" as="p">
                            In the theme editor, you can modify the "External Button" block to change colors, sizing, and placement.
                          </Text>
                        </BlockStack>
                      </Banner>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </form>
            </Card>
          </Layout.Section>
        ) : (
          !loaderData?.error && !isLoadingPicker && (
            <Layout.Section>
              <EmptyState
                heading="Select product to configure"
                action={{
                  content: "Select Product",
                  onAction: handleOpenProductPicker,
                  loading: isLoadingPicker,
                  icon: ProductIcon
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" variant="bodyMd">
                  Start by selecting a product for which you want to configure an external affiliate link.
                </Text>
              </EmptyState>
            </Layout.Section>
          )
        )}

        {/* Next steps instructions */}
        {currentProduct && externalLinks.length > 0 && externalLinks.some((link: ExternalLink) => link.enabled !== false && link.url && link.text) && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Configuration complete!</Text>
                <Banner tone="success">
                  <BlockStack gap="300">
                    <Text variant="bodyLg" fontWeight="semibold" as="p">
                      Your external buttons are now active and will appear automatically on this product page.
                    </Text>
                    <BlockStack gap="200">
                      <Text as="p"><strong>✓ Buttons configured</strong> - {externalLinks.filter((link: ExternalLink) => link.enabled !== false && link.url && link.text).length} external link button(s) ready</Text>
                      <Text as="p"><strong>✓ Automatically displayed</strong> - No manual setup required</Text>
                      <Text as="p"><strong>1. Test the buttons</strong> - Visit your product page to see them in action</Text>
                      <Text as="p"><strong>2. Optional customization</strong> - Use theme editor above to modify appearance</Text>
                    </BlockStack>
                  </BlockStack>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}