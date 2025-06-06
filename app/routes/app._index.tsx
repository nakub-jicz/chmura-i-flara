import React, { useEffect, useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useNavigation, useActionData, useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  Icon,
  Collapsible,
  List,
  Banner,
  Divider,
  Box,
  TextField,
  Modal,
  Checkbox,
  FormLayout,
  ButtonGroup,
  Thumbnail,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
} from "@shopify/polaris";
import {
  ProductIcon,
  SettingsIcon,
  ThemeIcon,
  ExternalIcon,
  CheckIcon,
  InfoIcon,
  QuestionCircleIcon,
  ViewIcon,
  DeleteIcon,
  AlertTriangleIcon,
  LinkIcon,
  EditIcon,
  PlusIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@shopify/polaris-icons';
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";

// GraphQL Response types
interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
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

interface ProductsQueryResponse {
  products: {
    nodes: Array<{
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
    }>;
  };
}

interface ThemesQueryResponse {
  themes: {
    nodes: Array<{
      id: string;
      name: string;
      role: string;
    }>;
  };
}

interface ProductUpdateResponse {
  productUpdate: {
    product: {
      id: string;
      title: string;
    };
    userErrors: Array<{
      field?: string[];
      message: string;
    }>;
  };
}

// Enhanced App Bridge types
declare global {
  interface Window {
    shopify?: {
      features?: {
        unsavedChanges?: {
          enable(): void;
          disable(): void;
        };
        saveBar?: {
          show(options: any): void;
          hide(): void;
        };
      };
      toast?: {
        show(message: string, options?: { isError?: boolean; duration?: number }): void;
      };
    };
  }
}

// Type definitions
interface Product {
  id: string;
  title: string;
  handle: string;
  featuredImage?: {
    url: string;
    altText?: string;
  };
  externalUrl: string;
  buttonText: string;
  isEnabled: boolean;
  hideAtc: boolean;
  hasMetafields: boolean;
  hasMultipleLinks: boolean;
  // Add full external links for proper state management
  externalLinks: ExternalLink[];
}

interface ActionData {
  success?: boolean;
  error?: string;
  message?: string;
}

interface LoaderData {
  themeEditorUrl?: string;
  configuredProducts?: Product[];
  shopDomain?: string;
}

interface Metafield {
  key: string;
  value: string;
}

interface ExternalLink {
  text: string;
  url: string;
  enabled: boolean;
}

interface ExpandedProduct {
  id: string;
  isExpanded: boolean;
  isEditing: boolean;
  externalLinks: ExternalLink[];
  hideAtc: boolean;
  isSaving: boolean;
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin } = await shopify(context).authenticate.admin(request);

  try {
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const productId = formData.get("productId");

    console.log('Action called with:', { actionType, productId });

    if (actionType === "save" && productId) {
      // Save product configuration
      const externalLinksData = formData.get("externalLinks");
      const hideAtcData = formData.get("hideAtc");

      if (!externalLinksData) {
        return json({
          error: "Missing external links data",
          success: false
        });
      }

      let externalLinks: ExternalLink[];
      try {
        externalLinks = JSON.parse(externalLinksData as string);
      } catch (e: any) {
        console.error("Error parsing external links:", e);
        return json({
          error: "Invalid external links format",
          success: false
        });
      }

      const hideAtc = hideAtcData === "on";
      const METAFIELD_NAMESPACE = "bl_custom_button";

      // First delete existing metafields
      const deleteQuery = `
        query getProductMetafields($id: ID!) {
          product(id: $id) {
            metafields(first: 20, namespace: "${METAFIELD_NAMESPACE}") {
              nodes {
                key
              }
            }
          }
        }
      `;

      const deleteResponse = await admin.graphql(deleteQuery, {
        variables: { id: productId }
      });

      const deleteData = await deleteResponse.json() as GraphQLResponse<{
        product: { metafields: { nodes: Array<{ key: string }> } };
      }>;

      if (deleteData.data?.product?.metafields?.nodes?.length && deleteData.data.product.metafields.nodes.length > 0) {
        const keysToDelete = deleteData.data.product.metafields.nodes.map(m => m.key);
        const deleteMutation = `
          mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
            metafieldsDelete(metafields: $metafields) {
              deletedMetafields {
                key
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        await admin.graphql(deleteMutation, {
          variables: {
            metafields: keysToDelete.map(key => ({
              ownerId: productId,
              namespace: METAFIELD_NAMESPACE,
              key: key
            }))
          }
        });
      }

      // Save new configuration
      const metafieldsToCreate: Array<{ key: string; value: string; type: string }> = [];

      if (externalLinks.length > 0) {
        metafieldsToCreate.push({
          key: "external_links",
          value: JSON.stringify(externalLinks),
          type: "json"
        });
      }

      if (hideAtc) {
        metafieldsToCreate.push({
          key: "hide_atc",
          value: "true",
          type: "single_line_text_field"
        });
      }

      if (metafieldsToCreate.length > 0) {
        const saveMutation = `
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              product {
                id
                title
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const saveResponse = await admin.graphql(saveMutation, {
          variables: {
            input: {
              id: productId,
              metafields: metafieldsToCreate.map(field => ({
                namespace: METAFIELD_NAMESPACE,
                key: field.key,
                value: field.value,
                type: field.type
              }))
            }
          }
        });

        const saveData = await saveResponse.json() as GraphQLResponse<ProductUpdateResponse>;

        if (saveData.errors || (saveData.data?.productUpdate?.userErrors?.length ?? 0) > 0) {
          const errors = saveData.errors || saveData.data?.productUpdate?.userErrors || [];
          return json({
            error: "Failed to save: " + errors.map((e: any) => e.message).join(", "),
            success: false
          });
        }
      }

      return json({
        success: true,
        message: "Product configuration saved successfully!"
      });

    } else if (actionType === "delete" && productId) {
      // Delete all metafields for this product
      const METAFIELD_NAMESPACE = "bl_custom_button";

      // First, get existing metafields
      const getMetafieldsQuery = `
        query getProductMetafields($id: ID!) {
          product(id: $id) {
            title
            metafields(first: 20, namespace: "${METAFIELD_NAMESPACE}") {
              nodes {
                key
              }
            }
          }
        }
      `;

      console.log('Querying metafields for product:', productId);
      const metafieldsResponse = await admin.graphql(getMetafieldsQuery, {
        variables: { id: productId }
      });

      const metafieldsData = await metafieldsResponse.json() as GraphQLResponse<{
        product: {
          title: string;
          metafields: {
            nodes: Array<{ key: string }>;
          };
        };
      }>;

      console.log('Metafields response:', metafieldsData);

      if (metafieldsData.errors) {
        console.error("GraphQL errors:", metafieldsData.errors);
        return json({
          error: "Failed to fetch metafields: " + metafieldsData.errors[0].message,
          success: false
        });
      }

      const product = metafieldsData.data?.product;
      const existingMetafields = product?.metafields?.nodes || [];

      if (existingMetafields.length > 0) {
        const deleteMetafieldsMutation = `
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

        const metafieldIdentifiers = existingMetafields.map((mf: { key: string }) => ({
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE,
          key: mf.key
        }));

        const deleteResponse = await admin.graphql(deleteMetafieldsMutation, {
          variables: {
            metafields: metafieldIdentifiers
          }
        });

        const deleteData = await deleteResponse.json() as GraphQLResponse<MetafieldsDeleteResponse>;

        if (deleteData.errors) {
          console.error("GraphQL errors:", deleteData.errors);
          return json({
            error: "Failed to delete product configuration: " + deleteData.errors[0].message,
            success: false
          });
        }

        const userErrors = deleteData.data?.metafieldsDelete?.userErrors || [];
        if (userErrors.length > 0) {
          console.error("Delete errors:", userErrors);
          return json({
            error: "Failed to delete product configuration",
            success: false
          });
        }

        console.log(`Successfully deleted configuration for product: ${product?.title}`);
        console.log('Returning success response:', {
          success: true,
          message: `Configuration for "${product?.title}" has been removed successfully.`
        });
        return json({
          success: true,
          message: `Configuration for "${product?.title}" has been removed successfully.`
        });
      } else {
        return json({
          success: true,
          message: "Product configuration was already removed."
        });
      }
    }

    return json({ error: "Invalid action", success: false });
  } catch (error: any) {
    console.error("Error in action:", error);
    return json({
      error: "Failed to delete product configuration: " + error.message,
      success: false
    });
  }
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await shopify(context).authenticate.admin(request);

  // Pobierz dane o aktywnym motywie
  let themeEditorUrl: string | null = null;
  try {
    const themeQuery = `
      query getThemes {
        themes(first: 10) {
          nodes {
            id
            name
            role
          }
        }
      }
    `;

    const themeResponse = await admin.graphql(themeQuery);
    const themeData = await themeResponse.json() as GraphQLResponse<ThemesQueryResponse>;

    if (themeData.errors) {
      console.error("Theme GraphQL errors:", themeData.errors);
    } else if (themeData.data?.themes?.nodes) {
      const activeTheme = themeData.data.themes.nodes.find((theme) => theme.role === 'MAIN');
      if (activeTheme) {
        // Generuj URL do edytora motywu - usuwamy "gid://shopify/Theme/" z ID
        const themeId = activeTheme.id.replace('gid://shopify/Theme/', '');
        themeEditorUrl = `https://${session.shop}/admin/themes/${themeId}/editor`;
      }
    }
  } catch (error) {
    console.error("Error fetching theme data:", error);
    // Fallback - użyj ogólnego URL do motywów
    themeEditorUrl = `https://${session.shop}/admin/themes`;
  }

  // Pobierz produkty z skonfigurowanymi zewnętrznymi linkami
  let configuredProducts: Product[] = [];
  try {
    const productsQuery = `
      query getProductsWithMetafields($namespace: String!) {
        products(first: 100) {
          nodes {
            id
            title
            handle
            featuredImage {
              url
              altText
            }
            metafields(first: 10, namespace: $namespace) {
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
      }
    `;

    console.log("Fetching products with metafields...");
    const productsResponse = await admin.graphql(productsQuery, {
      variables: { namespace: "bl_custom_button" }
    });

    const productsData = await productsResponse.json() as GraphQLResponse<ProductsQueryResponse>;
    console.log("Products response:", JSON.stringify(productsData, null, 2));

    if (productsData.errors) {
      console.error("Products GraphQL errors:", productsData.errors);
    } else if (productsData.data?.products?.nodes) {
      const allProducts = productsData.data.products.nodes;
      console.log("Total products found:", allProducts.length);

      configuredProducts = allProducts.map((product) => {
        const metafields = product.metafields?.nodes || [];
        const metafieldMap: Record<string, string> = {};

        metafields.forEach((mf) => {
          metafieldMap[mf.key] = mf.value;
        });

        console.log(`Product ${product.title} metafields:`, metafieldMap);

        // Support both old and new format
        let externalLinks: ExternalLink[] = [];
        let buttonText = "";
        let externalUrl = "";
        let isEnabled = false;

        // Try new format first (external_links JSON)
        if (metafieldMap["external_links"]) {
          try {
            externalLinks = JSON.parse(metafieldMap["external_links"]);
            // For display purposes, use the first enabled link
            const enabledLink = externalLinks.find((link: ExternalLink) => link.enabled !== false);
            if (enabledLink) {
              buttonText = enabledLink.text || "";
              externalUrl = enabledLink.url || "";
              isEnabled = true;
            }
          } catch (error) {
            console.error(`Error parsing external links JSON for ${product.title}:`, error);
          }
        }
        // Fallback to old format (individual metafields)
        else {
          buttonText = metafieldMap["button_text"] || "";
          externalUrl = metafieldMap["external_url"] || "";
          isEnabled = metafieldMap["is_enabled"] === "true";
        }

        return {
          id: product.id,
          title: product.title,
          handle: product.handle,
          featuredImage: product.featuredImage,
          externalUrl: externalUrl,
          buttonText: buttonText,
          isEnabled: isEnabled,
          hideAtc: metafieldMap["hide_atc"] === "true",
          hasMetafields: metafields.length > 0,
          hasMultipleLinks: externalLinks.length > 1,
          externalLinks: externalLinks
        };
      }).filter((product: Product) => product.hasMetafields && (product.externalUrl || product.buttonText)); // Only show products with metafields and some configuration

      console.log("Products with metafields:", configuredProducts.length);
    }

    console.log("Final configured products:", configuredProducts);
  } catch (error) {
    console.error("Error fetching configured products:", error);
  }

  return json({ themeEditorUrl, configuredProducts, shopDomain: session.shop });
};

export default function Index() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const themeEditorUrl = loaderData?.themeEditorUrl || "#";
  const configuredProducts = loaderData?.configuredProducts || [];
  const shopDomain = loaderData?.shopDomain || "";
  const submit = useSubmit();
  const shopify = useAppBridge();

  // State for one-page functionality
  const [setupOpen, setSetupOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<{ [key: string]: ExpandedProduct }>({});
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);

  const handlePreviewProduct = (handle: string) => {
    const previewUrl = `https://${shopDomain}/products/${handle}`;
    window.open(previewUrl, '_blank');
  };

  // Product picker function
  const handleOpenProductPicker = useCallback(async () => {
    if (isLoadingPicker) return;

    setIsLoadingPicker(true);
    try {
      shopify?.toast?.show("Opening product picker...", { duration: 2000 });

      const picker = await (shopify as any).resourcePicker({
        type: "product",
        multiple: false,
        showVariants: false,
      });

      if (picker && picker.selection && picker.selection.length > 0) {
        const selected = picker.selection[0];
        shopify?.toast?.show(`Selected: ${selected.title}`, { duration: 3000 });

        // Create new product entry for editing
        const newProduct: Product = {
          id: selected.id,
          title: selected.title,
          handle: selected.handle,
          featuredImage: selected.featuredImage,
          externalUrl: "",
          buttonText: "",
          isEnabled: false,
          hideAtc: false,
          hasMetafields: false,
          hasMultipleLinks: false,
          externalLinks: []
        };

        // Expand this product for editing
        setExpandedProducts(prev => ({
          ...prev,
          [selected.id]: {
            id: selected.id,
            isExpanded: true,
            isEditing: true,
            externalLinks: [{ url: "", text: "", enabled: true }],
            hideAtc: false,
            isSaving: false
          }
        }));

        setSelectedProductForEdit(newProduct);
      } else {
        shopify?.toast?.show("No product selected", { duration: 2000 });
      }
    } catch (error) {
      console.error("Error selecting product:", error);
      shopify?.toast?.show("Error selecting product", { isError: true, duration: 4000 });
    } finally {
      setIsLoadingPicker(false);
    }
  }, [shopify, isLoadingPicker]);

  // Toggle product expansion
  const toggleProductExpansion = (productId: string, product: Product) => {
    setExpandedProducts(prev => {
      const current = prev[productId];
      if (current) {
        return {
          ...prev,
          [productId]: {
            ...current,
            isExpanded: !current.isExpanded
          }
        };
      } else {
        // Initialize expanded state from existing product data
        const externalLinks = product.externalLinks.length > 0
          ? product.externalLinks
          : [{ url: "", text: "", enabled: true }];

        return {
          ...prev,
          [productId]: {
            id: productId,
            isExpanded: true,
            isEditing: false,
            externalLinks,
            hideAtc: product.hideAtc,
            isSaving: false
          }
        };
      }
    });
  };

  // Start editing a product
  const startEditingProduct = (productId: string) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        isEditing: true
      }
    }));
  };

  // Save product configuration
  const saveProductConfiguration = (productId: string) => {
    const expandedProduct = expandedProducts[productId];
    if (!expandedProduct) return;

    setExpandedProducts(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        isSaving: true
      }
    }));

    const formData = new FormData();
    formData.set("actionType", "save");
    formData.set("productId", productId);
    formData.set("externalLinks", JSON.stringify(expandedProduct.externalLinks));
    formData.set("hideAtc", expandedProduct.hideAtc ? "on" : "off");

    submit(formData, { method: "post" });
    shopify?.toast?.show("Saving configuration...", { duration: 2000 });
  };

  // Update external link in expanded product
  const updateExternalLink = (productId: string, index: number, field: keyof ExternalLink, value: string | boolean) => {
    setExpandedProducts(prev => {
      if (!prev[productId]) return prev;
      return {
        ...prev,
        [productId]: {
          ...prev[productId],
          externalLinks: prev[productId].externalLinks.map((link, i) =>
            i === index ? { ...link, [field]: value } : link
          )
        }
      };
    });
  };

  // Add new external link
  const addExternalLink = (productId: string) => {
    setExpandedProducts(prev => {
      if (!prev[productId]) return prev;
      return {
        ...prev,
        [productId]: {
          ...prev[productId],
          externalLinks: [...prev[productId].externalLinks, { url: "", text: "", enabled: true }]
        }
      };
    });
  };

  // Remove external link
  const removeExternalLink = (productId: string, index: number) => {
    setExpandedProducts(prev => {
      if (!prev[productId]) return prev;
      return {
        ...prev,
        [productId]: {
          ...prev[productId],
          externalLinks: prev[productId].externalLinks.filter((_, i) => i !== index)
        }
      };
    });
  };

  // Handle action data effects
  useEffect(() => {
    if (actionData?.success) {
      shopify?.toast?.show(actionData.message || "Success", { duration: 5000 });
      setIsDeleting(false);

      // Reset saving state for all products
      setExpandedProducts(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(productId => {
          updated[productId] = {
            ...updated[productId],
            isSaving: false
          };
        });
        return updated;
      });

      // Clear selected product for edit if it was just saved
      if (selectedProductForEdit) {
        setSelectedProductForEdit(null);
      }
    } else if (actionData?.error) {
      shopify?.toast?.show(actionData.error, { isError: true, duration: 5000 });
      setIsDeleting(false);

      // Reset saving state for all products
      setExpandedProducts(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(productId => {
          updated[productId] = {
            ...updated[productId],
            isSaving: false
          };
        });
        return updated;
      });
    }
  }, [actionData, shopify, selectedProductForEdit]);

  const handleDeleteClick = (product: Product) => {
    console.log('Delete clicked for product:', product.title);
    setProductToDelete(product);
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    console.log('Confirming delete for product:', productToDelete?.title);
    if (productToDelete) {
      setIsDeleting(true);
      const formData = new FormData();
      formData.set("actionType", "delete");
      formData.set("productId", productToDelete.id);

      console.log('Submitting delete form data:', {
        actionType: "delete",
        productId: productToDelete.id
      });

      submit(formData, { method: "post" });
      shopify?.toast?.show(`Deleting configuration for "${productToDelete.title}"...`, { duration: 2000 });
    }
    setDeleteModalOpen(false);
    setProductToDelete(null);
  };

  const cancelDelete = () => {
    console.log('Delete cancelled');
    setDeleteModalOpen(false);
    setProductToDelete(null);
  };

  // Function to truncate URL for better display
  const truncateUrl = (url: string, maxLength = 50): string => {
    if (!url || url.length <= maxLength) return url;

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const path = urlObj.pathname + urlObj.search;

      if (domain.length + 10 >= maxLength) {
        return domain + '...';
      }

      const availableLength = maxLength - domain.length - 3; // 3 for "..."
      if (path.length > availableLength) {
        return domain + path.substring(0, availableLength) + '...';
      }

      return url;
    } catch {
      // If URL parsing fails, just truncate the string
      return url.substring(0, maxLength - 3) + '...';
    }
  };

  return (
    <Page
      title="DC External Links"
      primaryAction={{
        content: isLoadingPicker ? "Selecting..." : "Add Product",
        onAction: handleOpenProductPicker,
        loading: isLoadingPicker,
        disabled: isLoadingPicker,
        icon: ProductIcon
      }}
    >
      <Layout>
        {/* Banner powitalny */}
        <Layout.Section>
          <Banner
            title="Welcome to DC External Links"
            tone="success"
            icon={CheckIcon}
          >
            <Text as="p" variant="bodyMd">
              Add external affiliate links to your products, replacing the standard "Add to cart" button
              with custom buttons that redirect to external pages.
            </Text>
          </Banner>
        </Layout.Section>

        {/* Configured Products Management */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Configured products</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={configuredProducts.length > 0 ? "success" : "info"}>
                    {`${configuredProducts.length} configured`}
                  </Badge>
                  <Button
                    variant="primary"
                    size="medium"
                    onClick={handleOpenProductPicker}
                    loading={isLoadingPicker}
                    disabled={isLoadingPicker}
                    icon={ProductIcon}
                  >
                    {isLoadingPicker ? "Selecting..." : "Add Product"}
                  </Button>
                </InlineStack>
              </InlineStack>

              {/* Show newly selected product for configuration */}
              {selectedProductForEdit && !configuredProducts.find(p => p.id === selectedProductForEdit.id) && (
                <Card background="bg-surface-success">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        {selectedProductForEdit.featuredImage && (
                          <Thumbnail
                            source={selectedProductForEdit.featuredImage.url}
                            alt={selectedProductForEdit.featuredImage.altText || ""}
                            size="medium"
                          />
                        )}
                        <BlockStack gap="200">
                          <Text as="h3" variant="bodyLg" fontWeight="semibold">
                            {selectedProductForEdit.title}
                          </Text>
                          <Badge tone="info">New Product - Configure Below</Badge>
                        </BlockStack>
                      </InlineStack>
                      <Button
                        variant="plain"
                        onClick={() => setSelectedProductForEdit(null)}
                        icon={DeleteIcon}
                      >
                        Cancel
                      </Button>
                    </InlineStack>

                    {/* Configuration for new product */}
                    {expandedProducts[selectedProductForEdit.id]?.isExpanded && (
                      <Card>
                        <BlockStack gap="400">
                          <Text as="h3" variant="headingMd">
                            Configure: {selectedProductForEdit.title}
                          </Text>

                          {/* External Links Configuration */}
                          <Card>
                            <BlockStack gap="400">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="h4" variant="bodyLg" fontWeight="semibold">External Links</Text>
                                <Button
                                  onClick={() => addExternalLink(selectedProductForEdit.id)}
                                  icon={PlusIcon}
                                  size="medium"
                                >
                                  Add Link
                                </Button>
                              </InlineStack>

                              {expandedProducts[selectedProductForEdit.id]?.externalLinks?.length > 0 ? (
                                <BlockStack gap="300">
                                  {expandedProducts[selectedProductForEdit.id].externalLinks.map((link, index) => (
                                    <Card key={index} background="bg-surface">
                                      <BlockStack gap="300">
                                        <InlineStack align="space-between" blockAlign="center">
                                          <Text as="h5" variant="bodyMd" fontWeight="semibold">
                                            Link {index + 1}
                                          </Text>
                                          <Button
                                            onClick={() => removeExternalLink(selectedProductForEdit.id, index)}
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
                                            onChange={(value) => updateExternalLink(selectedProductForEdit.id, index, "url", value)}
                                            autoComplete="off"
                                            placeholder="https://amazon.com/product/..."
                                            helpText="Full URL where the button should redirect"
                                          />

                                          <TextField
                                            label="Button text"
                                            value={link.text || ""}
                                            onChange={(value) => updateExternalLink(selectedProductForEdit.id, index, "text", value)}
                                            autoComplete="off"
                                            placeholder="Buy on Amazon"
                                            helpText="Text displayed on the button"
                                          />

                                          <Checkbox
                                            label="Enable this button"
                                            checked={link.enabled !== false}
                                            onChange={(checked) => updateExternalLink(selectedProductForEdit.id, index, "enabled", checked)}
                                            helpText="When enabled, this button will be visible on the product page"
                                          />
                                        </FormLayout>
                                      </BlockStack>
                                    </Card>
                                  ))}
                                </BlockStack>
                              ) : (
                                <EmptyState
                                  heading="No external links configured"
                                  action={{
                                    content: "Add your first link",
                                    onAction: () => addExternalLink(selectedProductForEdit.id),
                                    icon: PlusIcon
                                  }}
                                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                >
                                  <Text as="p" variant="bodyMd">
                                    Add external links (e.g., affiliate links) that will appear as buttons on your product page.
                                  </Text>
                                </EmptyState>
                              )}
                            </BlockStack>
                          </Card>

                          {/* Display Options */}
                          <Card>
                            <BlockStack gap="300">
                              <Text as="h4" variant="bodyLg" fontWeight="semibold">Display Options</Text>
                              <Checkbox
                                label="Hide original 'Add to cart' button (experimental)"
                                checked={expandedProducts[selectedProductForEdit.id]?.hideAtc || false}
                                onChange={(checked) => setExpandedProducts(prev => ({
                                  ...prev,
                                  [selectedProductForEdit.id]: {
                                    ...prev[selectedProductForEdit.id],
                                    hideAtc: checked
                                  }
                                }))}
                                helpText="WARNING: This feature may not work with all themes. Test before publishing."
                              />
                            </BlockStack>
                          </Card>

                          {/* Action Buttons */}
                          <InlineStack gap="300" align="start">
                            <Button
                              variant="primary"
                              onClick={() => saveProductConfiguration(selectedProductForEdit.id)}
                              loading={expandedProducts[selectedProductForEdit.id]?.isSaving}
                              disabled={expandedProducts[selectedProductForEdit.id]?.isSaving}
                              icon={CheckIcon}
                            >
                              {expandedProducts[selectedProductForEdit.id]?.isSaving ? "Saving..." : "Save Configuration"}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => handlePreviewProduct(selectedProductForEdit.handle)}
                              icon={ViewIcon}
                            >
                              Preview Product
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Card>
                    )}
                  </BlockStack>
                </Card>
              )}

              {configuredProducts.length > 0 ? (
                <BlockStack gap="300">
                  {configuredProducts.map((product: Product) => (
                    <Card key={product.id}>
                      <InlineStack align="space-between" blockAlign="start" gap="400">
                        <InlineStack gap="300" blockAlign="center">
                          {product.featuredImage && (
                            <div style={{ flexShrink: 0 }}>
                              <img
                                src={product.featuredImage.url}
                                alt={product.featuredImage.altText || ""}
                                style={{
                                  width: "40px",
                                  height: "40px",
                                  objectFit: "cover",
                                  borderRadius: "4px"
                                }}
                              />
                            </div>
                          )}
                          <BlockStack gap="200">
                            <Text as="h3" variant="bodyLg" fontWeight="semibold">
                              {product.title}
                            </Text>
                            <InlineStack gap="200" blockAlign="center" wrap={false}>
                              <Badge tone={product.isEnabled ? "success" : "critical"}>
                                {product.isEnabled ? "Enabled" : "Disabled"}
                              </Badge>
                              {product.hasMultipleLinks && (
                                <Badge tone="info">
                                  Multiple links
                                </Badge>
                              )}
                              {product.buttonText && (
                                <Text as="span" variant="bodyMd" tone="subdued">
                                  Button: "{product.buttonText}"
                                </Text>
                              )}
                            </InlineStack>
                            {product.externalUrl && (
                              <InlineStack gap="100" blockAlign="center">
                                <Icon source={ExternalIcon} />
                                <Text
                                  as="span"
                                  variant="bodyMd"
                                  tone="subdued"
                                >
                                  {truncateUrl(product.externalUrl, 60)}
                                </Text>
                              </InlineStack>
                            )}
                          </BlockStack>
                        </InlineStack>

                        <InlineStack gap="200">
                          <Button
                            variant="secondary"
                            size="medium"
                            onClick={() => {
                              toggleProductExpansion(product.id, product);
                              if (!expandedProducts[product.id]?.isExpanded) {
                                startEditingProduct(product.id);
                              }
                            }}
                            icon={expandedProducts[product.id]?.isExpanded ? ChevronUpIcon : SettingsIcon}
                          >
                            {expandedProducts[product.id]?.isExpanded ? "Collapse" : "Edit"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="medium"
                            onClick={() => handlePreviewProduct(product.handle)}
                            icon={ViewIcon}
                          >
                            Preview
                          </Button>
                          <Button
                            variant="secondary"
                            size="medium"
                            tone="critical"
                            onClick={() => handleDeleteClick(product)}
                            icon={DeleteIcon}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </InlineStack>

                      {/* Expanded configuration section */}
                      {expandedProducts[product.id]?.isExpanded && (
                        <Card background="bg-surface-secondary">
                          <BlockStack gap="400">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text variant="headingMd" as="h3">
                                Configure: {product.title}
                              </Text>
                              {expandedProducts[product.id]?.isSaving && (
                                <InlineStack gap="100" blockAlign="center">
                                  <Spinner accessibilityLabel="Saving" size="small" />
                                  <Badge tone="info">Saving...</Badge>
                                </InlineStack>
                              )}
                            </InlineStack>

                            {/* External Links Configuration */}
                            <Card>
                              <BlockStack gap="400">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text as="h4" variant="bodyLg" fontWeight="semibold">External Links</Text>
                                  <Button
                                    onClick={() => addExternalLink(product.id)}
                                    icon={PlusIcon}
                                    size="medium"
                                  >
                                    Add Link
                                  </Button>
                                </InlineStack>

                                {expandedProducts[product.id]?.externalLinks?.length > 0 ? (
                                  <BlockStack gap="300">
                                    {expandedProducts[product.id].externalLinks.map((link, index) => (
                                      <Card key={index} background="bg-surface">
                                        <BlockStack gap="300">
                                          <InlineStack align="space-between" blockAlign="center">
                                            <Text as="h5" variant="bodyMd" fontWeight="semibold">
                                              Link {index + 1}
                                            </Text>
                                            <Button
                                              onClick={() => removeExternalLink(product.id, index)}
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
                                              onChange={(value) => updateExternalLink(product.id, index, "url", value)}
                                              autoComplete="off"
                                              placeholder="https://amazon.com/product/..."
                                              helpText="Full URL where the button should redirect"
                                            />

                                            <TextField
                                              label="Button text"
                                              value={link.text || ""}
                                              onChange={(value) => updateExternalLink(product.id, index, "text", value)}
                                              autoComplete="off"
                                              placeholder="Buy on Amazon"
                                              helpText="Text displayed on the button"
                                            />

                                            <Checkbox
                                              label="Enable this button"
                                              checked={link.enabled !== false}
                                              onChange={(checked) => updateExternalLink(product.id, index, "enabled", checked)}
                                              helpText="When enabled, this button will be visible on the product page"
                                            />
                                          </FormLayout>
                                        </BlockStack>
                                      </Card>
                                    ))}
                                  </BlockStack>
                                ) : (
                                  <EmptyState
                                    heading="No external links configured"
                                    action={{
                                      content: "Add your first link",
                                      onAction: () => addExternalLink(product.id),
                                      icon: PlusIcon
                                    }}
                                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                  >
                                    <Text as="p" variant="bodyMd">
                                      Add external links (e.g., affiliate links) that will appear as buttons on your product page.
                                    </Text>
                                  </EmptyState>
                                )}
                              </BlockStack>
                            </Card>

                            {/* Display Options */}
                            <Card>
                              <BlockStack gap="300">
                                <Text as="h4" variant="bodyLg" fontWeight="semibold">Display Options</Text>
                                <Checkbox
                                  label="Hide original 'Add to cart' button (experimental)"
                                  checked={expandedProducts[product.id]?.hideAtc || false}
                                  onChange={(checked) => setExpandedProducts(prev => ({
                                    ...prev,
                                    [product.id]: {
                                      ...prev[product.id],
                                      hideAtc: checked
                                    }
                                  }))}
                                  helpText="WARNING: This feature may not work with all themes. Test before publishing."
                                />
                              </BlockStack>
                            </Card>

                            {/* Action Buttons */}
                            <InlineStack gap="300" align="start">
                              <Button
                                variant="primary"
                                onClick={() => saveProductConfiguration(product.id)}
                                loading={expandedProducts[product.id]?.isSaving}
                                disabled={expandedProducts[product.id]?.isSaving}
                                icon={CheckIcon}
                              >
                                {expandedProducts[product.id]?.isSaving ? "Saving..." : "Save Configuration"}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => handlePreviewProduct(product.handle)}
                                icon={ViewIcon}
                              >
                                Preview Product
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      )}
                    </Card>
                  ))}
                </BlockStack>
              ) : (
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No products configured yet. Start by configuring your first product.
                  </Text>
                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      onClick={handleOpenProductPicker}
                      loading={isLoadingPicker}
                      disabled={isLoadingPicker}
                      icon={ProductIcon}
                    >
                      {isLoadingPicker ? "Selecting..." : "Configure first product"}
                    </Button>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Status aplikacji */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">App status</Text>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">Active</Badge>
                  <Text as="p">App installed and running</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">Ready</Badge>
                  <Text as="p">Theme extension available</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="info">Setup</Badge>
                  <Text as="p">Ready for product configuration</Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Instrukcje krok po kroku */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Setup instructions</Text>
                <Button
                  variant="plain"
                  onClick={() => setSetupOpen(!setupOpen)}
                  ariaExpanded={setupOpen}
                  ariaControls="setup-collapsible"
                >
                  {setupOpen ? 'Hide' : 'Show'}
                </Button>
              </InlineStack>

              <Collapsible
                open={setupOpen}
                id="setup-collapsible"
                transition={{ duration: '150ms', timingFunction: 'ease' }}
              >
                <BlockStack gap="400">
                  {/* Krok 1 */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="info">Step 1</Badge>
                        <Text as="h3" variant="bodyLg" fontWeight="semibold">Configure products</Text>
                      </InlineStack>
                      <Text as="p">
                        Go to Product Configuration and select products you want to add external affiliate links to.
                        Set the destination URL and button text for each product.
                      </Text>
                      <InlineStack gap="200">
                        <Button
                          onClick={handleOpenProductPicker}
                          loading={isLoadingPicker}
                          disabled={isLoadingPicker}
                          icon={ProductIcon}
                        >
                          {isLoadingPicker ? "Selecting..." : "Configure products"}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  {/* Krok 2 */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success">Step 2</Badge>
                        <Text as="h3" variant="bodyLg" fontWeight="semibold">Buttons appear automatically</Text>
                      </InlineStack>
                      <Text as="p">
                        Once you configure products, external buttons will automatically appear on those product pages.
                        No manual setup required in the theme editor.
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Optional: You can customize button appearance and position in the theme editor by modifying the "External Button" block.
                      </Text>
                    </BlockStack>
                  </Card>

                  {/* Krok 3 */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success">Step 3</Badge>
                        <Text as="h3" variant="bodyLg" fontWeight="semibold">Test and publish</Text>
                      </InlineStack>
                      <Text as="p">
                        Visit your product pages to verify that external buttons are displaying correctly and redirecting to the configured URLs.
                      </Text>
                      <List type="bullet">
                        <List.Item>Check that buttons appear on configured product pages</List.Item>
                        <List.Item>Test external redirects work as expected</List.Item>
                        <List.Item>Verify "Hide cart button" feature works if enabled</List.Item>
                        <List.Item>Publish changes when ready</List.Item>
                      </List>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* FAQ */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Frequently asked questions</Text>
                <Button
                  variant="plain"
                  onClick={() => setFaqOpen(!faqOpen)}
                  ariaExpanded={faqOpen}
                  ariaControls="faq-collapsible"
                >
                  {faqOpen ? 'Hide' : 'Show'}
                </Button>
              </InlineStack>

              <Collapsible
                open={faqOpen}
                id="faq-collapsible"
                transition={{ duration: '150ms', timingFunction: 'ease' }}
              >
                <BlockStack gap="400">
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        Why don't I see the external buttons on my product pages?
                      </Text>
                      <Text as="p">
                        External buttons appear automatically once you configure them in Product Configuration.
                        If you don't see them, make sure you've added at least one enabled external link for the product.
                        The buttons will show up on the product page without requiring any manual theme setup.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        How does hiding "Add to cart" buttons work?
                      </Text>
                      <Text as="p">
                        The feature automatically attempts to hide standard cart buttons using common CSS selectors.
                        Some themes may require additional configuration or may not support this feature.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        Will the block work with all themes?
                      </Text>
                      <Text as="p">
                        The block is compatible with most modern Shopify themes, but appearance may vary.
                        You can customize styles in the block settings within the theme editor.
                      </Text>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Wsparcie */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Need help?</Text>
              <Text as="p">
                If you have issues with configuration or app functionality, check the browser console logs
                or contact technical support.
              </Text>
              <InlineStack gap="200">
                <Button variant="secondary" icon={InfoIcon}>
                  Documentation
                </Button>
                <Button variant="secondary" icon={ExternalIcon}>
                  Report issue
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModalOpen}
        onClose={cancelDelete}
        title="Delete product configuration"
        primaryAction={{
          content: 'Delete',
          onAction: confirmDelete,
          destructive: true,
          loading: isDeleting,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: cancelDelete,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Are you sure you want to delete the configuration for "{productToDelete?.title}"?
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              This will remove all external links and settings for this product. This action cannot be undone.
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              The product will be removed from the configured products list.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}