import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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
  text?: string;
  url?: string;
  enabled?: boolean;
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin } = await shopify(context).authenticate.admin(request);

  try {
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const productId = formData.get("productId");

    console.log('Action called with:', { actionType, productId });

    if (actionType === "delete" && productId) {
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

        console.log(`Deleted configuration for product: ${product?.title}`);
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
          hideAtc: metafieldMap["hide_atc"] === "true" || metafieldMap["hide_atc"] === "true",
          hasMetafields: metafields.length > 0,
          hasMultipleLinks: externalLinks.length > 1
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
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [setupOpen, setSetupOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const handlePreviewProduct = (handle: string) => {
    const previewUrl = `https://${shopDomain}/products/${handle}`;
    window.open(previewUrl, '_blank');
  };

  const handleConfigureProducts = () => {
    console.log('Navigating to product-config...');
    try {
      navigate("/app/product-config");
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: use window.location
      window.location.href = "/app/product-config";
    }
  };

  const handleEditProduct = (productId: string) => {
    console.log('Editing product:', productId);
    try {
      navigate(`/app/product-config?productId=${productId}`);
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: use window.location
      window.location.href = `/app/product-config?productId=${productId}`;
    }
  };

  // Handle action data effects
  useEffect(() => {
    if (actionData?.success) {
      shopify?.toast?.show(actionData.message || "Success", { duration: 5000 });
      setIsDeleting(false);
    } else if (actionData?.error) {
      shopify?.toast?.show(actionData.error, { isError: true, duration: 5000 });
      setIsDeleting(false);
    }
  }, [actionData, shopify]);

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
        content: "Configure products",
        onAction: handleConfigureProducts,
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
                    onClick={handleConfigureProducts}
                    icon={ProductIcon}
                  >
                    Add Product
                  </Button>
                </InlineStack>
              </InlineStack>

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
                            onClick={() => handleEditProduct(product.id)}
                            icon={SettingsIcon}
                          >
                            Edit
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
                      icon={ProductIcon}
                      onClick={handleConfigureProducts}
                    >
                      Configure first product
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
                          icon={ProductIcon}
                          onClick={handleConfigureProducts}
                        >
                          Configure products
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