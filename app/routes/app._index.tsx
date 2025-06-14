import React, { useEffect, useState, useCallback, useRef } from "react";
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
  XSmallIcon,
  SaveIcon,
  ResetIcon,
  SearchIcon,
  RefreshIcon,
  StarIcon,
  GiftCardIcon,
  TextIcon,
  DuplicateIcon,
  BugIcon,
  EmailIcon,
  MagicIcon,
  NoteIcon,
  ClockIcon,
  LocationIcon,
  MoneyIcon,
  MenuHorizontalIcon,
  MenuVerticalIcon,
  HomeIcon,
  AppsIcon,
  CodeIcon,
} from '@shopify/polaris-icons';
import { useAppBridge, SaveBar } from "@shopify/app-bridge-react";
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

// Enhanced App Bridge types - Updated for newer API
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
      resourcePicker?: (options: any) => Promise<any>;
      ContextualSaveBar?: {
        create(options: any): any;
        Action?: {
          SHOW: string;
          HIDE: string;
        };
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
  blockAutoInstalled?: boolean;
  blockInstallationStatus?: string;
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

// Auto-installation helper functions
async function checkAutoInstallStatus(admin: any, shop: string): Promise<boolean> {
  try {
    // Use app metafields to track installation status
    const query = `
      query {
        currentAppInstallation {
          metafields(first: 1, namespace: "auto_install", key: "block_installed") {
            nodes {
              id
              value
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json();

    return data.data?.currentAppInstallation?.metafields?.nodes?.length > 0;
  } catch (error) {
    console.error('Error checking auto-install status:', error);
    return false;
  }
}



async function autoInstallAppBlock(admin: any, shop: string): Promise<{ success: boolean; status: string; message?: string }> {
  try {

    // 1. Get active theme
    const themeQuery = `
      query {
        themes(first: 5, role: MAIN) {
          nodes {
            id
            name
            role
          }
        }
      }
    `;

    const themeResponse = await admin.graphql(themeQuery);
    const themeData = await themeResponse.json();

    if (!themeData.data?.themes?.nodes?.length) {
      return { success: false, status: "no_active_theme", message: "No active theme found" };
    }

    const activeTheme = themeData.data.themes.nodes[0];
    const themeId = activeTheme.id.replace('gid://shopify/Theme/', '');


    // 2. Get theme files to find product template
    const filesQuery = `
      query getThemeFiles($themeId: ID!) {
        theme(id: $themeId) {
          files(first: 100) {
            nodes {
              filename
              body
            }
          }
        }
      }
    `;

    const filesResponse = await admin.graphql(filesQuery, {
      variables: { themeId: activeTheme.id }
    });

    const filesData = await filesResponse.json();

    if (!filesData.data?.theme?.files?.nodes) {
      return { success: false, status: "no_theme_files", message: "Could not read theme files" };
    }

    // 3. Find product template
    const productTemplates = filesData.data.theme.files.nodes.filter((file: any) =>
      file.filename.includes('product') && file.filename.includes('.json')
    );

    if (productTemplates.length === 0) {
      return { success: false, status: "no_product_template", message: "No product template found" };
    }

    // Use first product template found
    const productTemplate = productTemplates[0];
    let templateContent;

    try {
      templateContent = JSON.parse(productTemplate.body);
    } catch (error) {
      return { success: false, status: "invalid_template_json", message: "Could not parse template JSON" };
    }


    // 4. Check if our block is already added
    const appBlockId = `b47fbbd7a2798bdefa342301971e612b/external-button-block`;
    const hasOurBlock = JSON.stringify(templateContent).includes(appBlockId);

    if (hasOurBlock) {
      await markAutoInstallComplete(admin);
      return { success: true, status: "already_installed", message: "Block already exists in template" };
    }

    // 5. Add our block to the template
    if (!templateContent.sections) templateContent.sections = {};
    if (!templateContent.order) templateContent.order = [];

    // Find product-form section or main section
    const productFormSection = Object.keys(templateContent.sections).find(key =>
      key.includes('product-form') || key.includes('main-product')
    );

    if (productFormSection && templateContent.sections[productFormSection]) {
      const section = templateContent.sections[productFormSection];
      if (!section.blocks) section.blocks = {};
      if (!section.block_order) section.block_order = [];

      // Add our block
      const blockId = `external_button_${Date.now()}`;
      section.blocks[blockId] = {
        type: `${appBlockId}`,
        settings: {}
      };

      // Add to block order (preferably after add to cart button)
      // Look for various common add to cart block types
      const addToCartIndex = section.block_order.findIndex((id: string) => {
        const blockType = section.blocks[id]?.type?.toLowerCase() || '';
        return (
          blockType.includes('buy_buttons') ||
          blockType.includes('product_form') ||
          blockType.includes('add_to_cart') ||
          blockType.includes('cart_button') ||
          blockType.includes('purchase') ||
          blockType.includes('checkout') ||
          blockType === 'buy_buttons' ||
          blockType === 'product-form' ||
          // Shopify's common block types
          blockType === 'shopify://apps/product-form' ||
          blockType.includes('@app') ||
          // Dawn theme specific
          blockType === 'buy_buttons@product-form' ||
          // Other common patterns
          id.includes('buy') ||
          id.includes('cart') ||
          id.includes('purchase')
        );
      });

      if (addToCartIndex >= 0) {
        // Insert right after the add to cart button
        section.block_order.splice(addToCartIndex + 1, 0, blockId);
        console.log(`Added external button block after add-to-cart at position ${addToCartIndex + 1}`);
      } else {
        // Fallback: look for quantity selector or other form elements
        const formElementIndex = section.block_order.findIndex((id: string) => {
          const blockType = section.blocks[id]?.type?.toLowerCase() || '';
          return (
            blockType.includes('quantity') ||
            blockType.includes('variant') ||
            blockType.includes('picker') ||
            id.includes('quantity') ||
            id.includes('variant')
          );
        });

        if (formElementIndex >= 0) {
          // Insert after the last form element found
          section.block_order.splice(formElementIndex + 1, 0, blockId);
          console.log(`Added external button block after form element at position ${formElementIndex + 1}`);
        } else {
          // Last resort: add at the beginning of the form
          section.block_order.unshift(blockId);
          console.log(`Added external button block at the beginning of product form`);
        }
      }

    } else {
      return { success: false, status: "no_suitable_section", message: "Could not find suitable section to add block" };
    }

    // 6. Update the theme template
    const updateMutation = `
      mutation themeFilesUpsert($themeId: ID!, $files: [ThemeFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          themeFiles {
            filename
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateResponse = await admin.graphql(updateMutation, {
      variables: {
        themeId: activeTheme.id,
        files: [{
          filename: productTemplate.filename,
          body: JSON.stringify(templateContent, null, 2)
        }]
      }
    });

    const updateData = await updateResponse.json();

    if (updateData.data?.themeFilesUpsert?.userErrors?.length > 0) {
      console.error('Theme update errors:', updateData.data.themeFilesUpsert.userErrors);
      return {
        success: false,
        status: "update_failed",
        message: updateData.data.themeFilesUpsert.userErrors[0].message
      };
    }

    // 7. Mark installation as complete
    await markAutoInstallComplete(admin);

    return { success: true, status: "installed", message: "App block successfully added to theme" };

  } catch (error) {
    console.error('Error during auto-installation:', error);
    return {
      success: false,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function markAutoInstallComplete(admin: any): Promise<void> {
  try {
    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    await admin.graphql(mutation, {
      variables: {
        metafields: [{
          namespace: "auto_install",
          key: "block_installed",
          value: new Date().toISOString(),
          type: "single_line_text_field"
        }]
      }
    });

  } catch (error) {
    console.error('Error marking auto-install complete:', error);
  }
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  // Debug logs removed for production

  const { admin, session } = await shopify(context).authenticate.admin(request);
  // Session validation logs removed for production

  try {
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const productId = formData.get("productId");




    if (actionType === "save" && productId) {

      // Parse hide ATC data from checkbox 
      const hideAtcValue = formData.get("hideAtc");
      const hideAtc = hideAtcValue === "on";

      // Parse external links from form fields
      const linkCountString = formData.get("linkCount");
      const linkCount = parseInt(linkCountString as string || "0", 10);

      const externalLinks: ExternalLink[] = [];

      // Extract individual link data
      for (let i = 0; i < linkCount; i++) {
        const url = formData.get(`link_${i}_url`) as string || "";
        const text = formData.get(`link_${i}_text`) as string || "";
        const enabledValue = formData.get(`link_${i}_enabled`);
        const enabled = enabledValue === "on";


        externalLinks.push({
          url: url,
          text: text,
          enabled: enabled
        });
      }

      const METAFIELD_NAMESPACE = "bl_custom_button";

      // Get existing metafields to know which ones to update vs create
      const getExistingQuery = `
        query getProductMetafields($id: ID!) {
          product(id: $id) {
            metafields(first: 20, namespace: "${METAFIELD_NAMESPACE}") {
              nodes {
                id
                key
                value
                type
              }
            }
          }
        }
      `;

      const existingResponse = await admin.graphql(getExistingQuery, {
        variables: { id: productId }
      });

      const existingData = await existingResponse.json() as GraphQLResponse<{
        product: { metafields: { nodes: Array<{ id: string; key: string; value: string; type: string }> } };
      }>;


      const existingMetafields = existingData.data?.product?.metafields?.nodes || [];
      const existingMetafieldMap = new Map(existingMetafields.map(mf => [mf.key, mf]));

      // Mark metafields to delete that are no longer needed
      const keysToKeep = new Set(['external_links']);
      if (hideAtc) {
        keysToKeep.add('hide_atc');
      }

      const metafieldsToDelete = existingMetafields.filter(mf => !keysToKeep.has(mf.key));

      if (metafieldsToDelete.length > 0) {
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
            metafields: metafieldsToDelete.map(mf => ({
              ownerId: productId,
              namespace: METAFIELD_NAMESPACE,
              key: mf.key
            }))
          }
        });
      }

      // Prepare metafields for save (update existing or create new)
      const metafieldsToSave: Array<{ id?: string; key: string; value: string; type: string }> = [];


      // Always save external links data (even if empty or all disabled)
      const jsonValue = JSON.stringify(externalLinks);

      const existingExternalLinks = existingMetafieldMap.get("external_links");
      metafieldsToSave.push({
        ...(existingExternalLinks ? { id: existingExternalLinks.id } : {}),
        key: "external_links",
        value: jsonValue,
        type: "json"
      });

      if (hideAtc) {
        const existingHideAtc = existingMetafieldMap.get("hide_atc");
        metafieldsToSave.push({
          ...(existingHideAtc ? { id: existingHideAtc.id } : {}),
          key: "hide_atc",
          value: "true",
          type: "single_line_text_field"
        });
      } else {
      }


      if (metafieldsToSave.length > 0) {
        const saveMutation = `
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

        const mutationVariables = {
          input: {
            id: productId,
            metafields: metafieldsToSave.map((field: any) => ({
              namespace: METAFIELD_NAMESPACE,
              ...(field.id ? { id: field.id } : {}),
              key: field.key,
              value: field.value,
              type: field.type
            }))
          }
        };

        const saveResponse = await admin.graphql(saveMutation, {
          variables: mutationVariables
        });


        const saveData = await saveResponse.json() as GraphQLResponse<ProductUpdateResponse>;

        if (saveData.errors || (saveData.data?.productUpdate?.userErrors?.length ?? 0) > 0) {
          const errors = saveData.errors || saveData.data?.productUpdate?.userErrors || [];
          return json({
            error: "Failed to save: " + errors.map((e: any) => e.message).join(", "),
            success: false
          });
        }
      } else {
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


      if (metafieldsData.errors) {
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

  // Loader debug logs removed for production

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
    // Więcej szczegółowych informacji o błędzie
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


    const productsResponse = await admin.graphql(productsQuery, {
      variables: { namespace: "bl_custom_button" }
    });


    const productsData = await productsResponse.json() as GraphQLResponse<ProductsQueryResponse>;

    if (productsData.errors) {
      console.error("Products GraphQL errors:", productsData.errors);
      // Loguj szczegółowe informacje o błędach
      productsData.errors.forEach((error, index) => {
        console.error(`Error ${index + 1}:`, {
          message: error.message,
          locations: error.locations,
          path: error.path
        });
      });
    } else if (productsData.data?.products?.nodes) {
      const allProducts = productsData.data.products.nodes;

      configuredProducts = allProducts.map((product) => {
        const metafields = product.metafields?.nodes || [];
        const metafieldMap: Record<string, string> = {};

        metafields.forEach((mf) => {
          metafieldMap[mf.key] = mf.value;
        });


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
            const enabledLink = externalLinks.find((link: ExternalLink) => link.enabled === true);

            if (enabledLink) {
              buttonText = enabledLink.text || "";
              externalUrl = enabledLink.url || "";
              isEnabled = true;
            } else {
            }
          } catch (error) {
          }
        }
        // Fallback to old format (individual metafields)
        else {
          buttonText = metafieldMap["button_text"] || "";
          externalUrl = metafieldMap["external_url"] || "";
          isEnabled = metafieldMap["is_enabled"] === "true";
        }

        const productData = {
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

        console.log(`Product ${product.title} data:`, productData);
        return productData;
      }).filter((product: Product) => product.hasMetafields); // Show all products with metafields (including those with empty link arrays)

      console.log("Products with metafields:", configuredProducts.length);
    }

    console.log("Final configured products:", configuredProducts);
  } catch (error) {
    console.error("Error fetching configured products:", error);
    // Więcej szczegółowych informacji o błędzie
    if (error instanceof Error) {
      console.error('Products error message:', error.message);
      console.error('Products error stack:', error.stack);
    }
    if (error instanceof Response) {
      console.error('Response error status:', error.status);
      console.error('Response error statusText:', error.statusText);
    }
  }



  // Auto-install app block to theme (one-time)
  let blockAutoInstalled = false;
  let blockInstallationStatus = "not_attempted";

  try {
    // Check if auto-installation has already been attempted
    const autoInstallAttempted = await checkAutoInstallStatus(admin, session.shop);

    if (!autoInstallAttempted && configuredProducts.length > 0) {
      console.log('=== ATTEMPTING AUTO-INSTALL OF APP BLOCK ===');
      const installResult = await autoInstallAppBlock(admin, session.shop);
      blockAutoInstalled = installResult.success;
      blockInstallationStatus = installResult.status;
      console.log('Auto-install result:', installResult);
    } else if (autoInstallAttempted) {
      blockInstallationStatus = "previously_attempted";
    }
  } catch (error) {
    console.error('Error during auto-installation:', error);
    blockInstallationStatus = "error";
  }

  console.log('=== LOADER END ===');
  console.log('blockInstallationStatus:', blockInstallationStatus);
  console.log('configuredProducts count:', configuredProducts.length);
  const result = {
    themeEditorUrl,
    configuredProducts,
    shopDomain: session.shop,
    blockAutoInstalled,
    blockInstallationStatus
  };
  console.log('Returning from loader:', result);

  return json(result);
};

export default function Index() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const themeEditorUrl = loaderData?.themeEditorUrl || "#";
  const configuredProducts = loaderData?.configuredProducts || [];
  const shopDomain = loaderData?.shopDomain || "";
  const blockAutoInstalled = loaderData?.blockAutoInstalled || false;
  const blockInstallationStatus = loaderData?.blockInstallationStatus || "not_attempted";
  const submit = useSubmit();
  const shopify = useAppBridge();

  // App configuration
  const APP_CLIENT_ID = "b47fbbd7a2798bdefa342301971e612b";
  const EXTENSION_NAME = "external-button-block";

  // State for dismissible notifications
  const [autoInstallNotificationDismissed, setAutoInstallNotificationDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dc-auto-install-notification-dismissed') === 'true';
    }
    return false;
  });

  // Generate auto-add URL for theme editor
  const getAutoAddUrl = () =>
    `https://${shopDomain}/admin/themes/current/editor?template=product&addAppBlockId=${APP_CLIENT_ID}/${EXTENSION_NAME}&target=section:product-form`;

  // Function to handle auto-add button click
  const handleAutoAddBlock = () => {
    window.open(getAutoAddUrl(), '_blank');
    // Mark as likely added to hide future warnings
    setBlockLikelyAdded(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dc-external-links-block-added', 'true');
    }
    shopify?.toast?.show("Opening theme editor to add button block", { duration: 2000 });
  };

  // Function to dismiss auto-install notification
  const dismissAutoInstallNotification = () => {
    setAutoInstallNotificationDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dc-auto-install-notification-dismissed', 'true');
    }
  };

  // Debug App Bridge availability
  useEffect(() => {
    console.log('=== APP BRIDGE DEBUG ===');
    console.log('App Bridge instance:', shopify);
    console.log('App Bridge type:', typeof shopify);
    console.log('Window shopify:', window.shopify);
    console.log('App Bridge methods available:', Object.keys(shopify || {}));

    // Debug notification display logic
    console.log('=== NOTIFICATION DEBUG ===');
    console.log('autoInstallNotificationDismissed:', autoInstallNotificationDismissed);
    console.log('blockInstallationStatus:', blockInstallationStatus);
    console.log('configuredProducts.length:', configuredProducts.length);
    console.log('blockLikelyAdded:', blockLikelyAdded);

    const shouldShowSuccess = !autoInstallNotificationDismissed && (blockInstallationStatus === "installed" || blockInstallationStatus === "already_installed");
    const shouldShowError = !autoInstallNotificationDismissed && blockInstallationStatus === "error";
    const shouldShowSetup = blockInstallationStatus === "not_attempted" && configuredProducts && configuredProducts.length > 0 && !blockLikelyAdded;

    console.log('shouldShowSuccess:', shouldShowSuccess);
    console.log('shouldShowError:', shouldShowError);
    console.log('shouldShowSetup:', shouldShowSetup);

    // Test specific methods
    if (shopify) {
      console.log('resourcePicker available:', typeof shopify.resourcePicker);
      console.log('resourcePicker type:', typeof shopify.resourcePicker);
      console.log('saveBar available:', typeof shopify.saveBar);
      console.log('saveBar methods:', shopify.saveBar ? Object.keys(shopify.saveBar) : 'N/A');
    }

    // Check URL params for debugging
    const urlParams = new URLSearchParams(window.location.search);
    console.log('URL host param:', urlParams.get('host'));
    console.log('URL shop param:', urlParams.get('shop'));
    console.log('Page location:', window.location.href);

    // Check if we're running in an iframe (embedded context)
    console.log('Is in iframe:', window.parent !== window);
    console.log('User agent:', navigator.userAgent);

    // Check if we have CORS issues
    console.log('Document origin:', document.location.origin);
    console.log('Referrer:', document.referrer);

    // Test network connectivity
    fetch(window.location.origin + '/favicon.ico')
      .then(response => console.log('Network test - favicon fetch:', response.status))
      .catch(error => console.error('Network test - favicon fetch failed:', error));

    console.log('=== END APP BRIDGE DEBUG ===');
  }, [shopify]);

  // State for one-page functionality
  const [setupOpen, setSetupOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<{ [key: string]: ExpandedProduct }>({});
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);
  const [saveBarVisible, setSaveBarVisible] = useState(false);
  const [currentSavingProductId, setCurrentSavingProductId] = useState<string | null>(null);

  // Check if user has likely added the block to theme
  const [blockLikelyAdded, setBlockLikelyAdded] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dc-external-links-block-added') === 'true';
    }
    return false;
  });

  // Remove old DOM manipulation logic - using SaveBar component now




  const handlePreviewProduct = (handle: string) => {
    const previewUrl = `https://${shopDomain}/products/${handle}`;
    window.open(previewUrl, '_blank');
  };





  // Product picker function - Updated for newer App Bridge API with fallbacks
  const handleOpenProductPicker = useCallback(async () => {
    if (isLoadingPicker) return;

    setIsLoadingPicker(true);
    try {
      // Check if we have access to the app bridge instance
      if (!shopify) {
        throw new Error("App Bridge not available - please refresh the page");
      }

      // Show loading toast
      if (window.shopify?.toast) {
        window.shopify.toast.show("Opening product picker (you can select multiple)...", { duration: 2000 });
      }

      console.log('Attempting to open resource picker with shopify instance:', shopify);
      console.log('Available methods on shopify:', Object.keys(shopify));

      // Try different approaches for resource picker
      let selection;

      // Wait a moment for App Bridge to fully initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Approach 1: Try the modern App Bridge API
      if (typeof shopify.resourcePicker === 'function') {
        console.log('Using App Bridge resourcePicker API');
        selection = await shopify.resourcePicker({
          type: "product",
          multiple: true,
        });
      } else {
        // Fallback: redirect to product selection page if picker not available
        console.warn('Resource picker not available, redirecting to manual selection');
        if (window.shopify?.toast) {
          window.shopify.toast.show("Product picker not available. Please try refreshing the page or contact support.", {
            isError: true,
            duration: 8000
          });
        }
        throw new Error("Resource picker method not available");
      }

      console.log('Resource picker returned:', selection);

      if (selection && selection.length > 0) {
        // Separate products into new and already configured
        const newProducts = selection.filter((selected: any) => {
          const selectedProduct = selected as any;
          return !configuredProducts.find(p => p.id === selectedProduct.id);
        });

        const alreadyConfigured = selection.filter((selected: any) => {
          const selectedProduct = selected as any;
          return configuredProducts.find(p => p.id === selectedProduct.id);
        });

        // Log skipped products
        alreadyConfigured.forEach((product: any) => {
          console.log(`Product ${product.title} is already configured, skipping...`);
        });

        // Show initial selection toast
        if (window.shopify?.toast) {
          if (newProducts.length > 0) {
            window.shopify.toast.show(`Adding ${newProducts.length} new product${newProducts.length > 1 ? 's' : ''}: ${newProducts.map(p => p.title).join(', ')}`, { duration: 4000 });
          } else {
            window.shopify.toast.show(`All selected products are already configured`, { duration: 3000 });
          }
        }

        // Process only new products
        for (const selectedProduct of newProducts) {
          // Save the product to add it to the configured products list
          const formData = new FormData();
          formData.set("actionType", "save");
          formData.set("productId", selectedProduct.id);
          formData.set("linkCount", "0"); // No links initially

          submit(formData, { method: "post" });

          // Add small delay between submissions to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Show info about skipped products
        if (alreadyConfigured.length > 0) {
          setTimeout(() => {
            if (window.shopify?.toast) {
              window.shopify.toast.show(`Skipped ${alreadyConfigured.length} already configured product${alreadyConfigured.length > 1 ? 's' : ''}: ${alreadyConfigured.map(p => p.title).join(', ')}`, { duration: 4000 });
            }
          }, 1000);
        }
      } else {
        if (window.shopify?.toast) {
          window.shopify.toast.show("No products selected", { duration: 2000 });
        }
      }
    } catch (error) {
      console.error("Error selecting product:", error);

      // More detailed error handling for different scenarios
      let errorMessage = "Error selecting product";
      let detailedMessage = "";

      if (error instanceof Error) {
        if (error.message.includes("App Bridge")) {
          errorMessage = "App Bridge not properly initialized";
          detailedMessage = "Please refresh the page and try again.";
        } else if (error.message.includes("permission")) {
          errorMessage = "Insufficient permissions to access products";
          detailedMessage = "Please ensure your user account has product access permissions.";
        } else if (error.message.includes("network")) {
          errorMessage = "Network error";
          detailedMessage = "Please check your internet connection and try again.";
        } else if (error.message.includes("not available")) {
          errorMessage = "Product picker unavailable";
          detailedMessage = "This may be due to Cloudflare Workers compatibility. Try refreshing the page or use manual product configuration.";
        }
      }

      console.log('=== PROBLEM DIAGNOSTYCZNY ===');
      console.log('Problem:', errorMessage);
      console.log('Szczegóły:', detailedMessage);
      console.log('App Bridge instance:', shopify);
      console.log('Dostępne metody:', Object.keys(shopify || {}));
      console.log('Window.shopify:', window.shopify);
      console.log('URL params:', new URLSearchParams(window.location.search).toString());
      console.log('===========================');

      if (window.shopify?.toast) {
        window.shopify.toast.show(`${errorMessage}. ${detailedMessage}`, { isError: true, duration: 8000 });
      } else {
        // Fallback to console if toast is not available
        console.error("Failed to show error toast:", errorMessage, detailedMessage);
        alert(`${errorMessage}\n\n${detailedMessage}\n\nSzczegóły zostały zapisane w konsoli przeglądarki (F12).`);
      }
    } finally {
      setIsLoadingPicker(false);
    }
  }, [shopify, isLoadingPicker]);

  // Toggle product expansion
  const toggleProductExpansion = (productId: string, product: Product) => {
    setExpandedProducts(prev => {
      const current = prev[productId];
      if (current) {
        const updated = {
          ...prev,
          [productId]: {
            ...current,
            isExpanded: !current.isExpanded
          }
        };
        return updated;
      } else {
        // Initialize expanded state from existing product data
        console.log(`=== INITIALIZING EXPANDED PRODUCT ===`);
        console.log(`Product ID: ${productId}`);
        console.log(`Product data:`, product);
        console.log(`Product external links:`, product.externalLinks);

        const externalLinks = product.externalLinks;

        console.log(`Using external links:`, externalLinks);

        const newExpanded = {
          id: productId,
          isExpanded: true,
          isEditing: false,
          externalLinks,
          hideAtc: product.hideAtc,
          isSaving: false
        };

        console.log(`New expanded state:`, newExpanded);
        console.log(`=== END INITIALIZATION ===`);



        return {
          ...prev,
          [productId]: newExpanded
        };
      }
    });
  };

  // Start editing a product
  const startEditingProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const updated = {
        ...prev,
        [productId]: {
          ...prev[productId],
          isEditing: true
        }
      };
      return updated;
    });
  };

  // Save single product configuration (used by individual save buttons)
  const saveProductConfiguration = (productId: string) => {
    console.log(`=== SAVE PRODUCT CONFIGURATION (DIRECT SAVE) ===`);
    console.log(`Saving directly from Save Changes button for product:`, productId);

    const expandedProduct = expandedProducts[productId];
    if (!expandedProduct) {
      console.error('No expanded product found for ID:', productId);
      shopify?.toast?.show("Error: Product data not found", { isError: true, duration: 3000 });
      return;
    }

    // Set saving state
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: { ...prev[productId], isSaving: true }
    }));

    // Filter out empty links before saving
    const validLinks = expandedProduct.externalLinks.filter(link => !isEmptyLink(link));

    // Create form data with the same logic as SaveBar
    const formData = new FormData();
    formData.set("actionType", "save");
    formData.set("productId", productId);
    formData.set("linkCount", validLinks.length.toString());

    // Add each valid external link's data
    validLinks.forEach((link, index) => {
      formData.set(`link_${index}_url`, link.url || "");
      formData.set(`link_${index}_text`, link.text || "");
      if (link.enabled) {
        formData.set(`link_${index}_enabled`, "on");
      }
    });

    // Hide ATC checkbox
    if (expandedProduct.hideAtc) {
      formData.set("hideAtc", "on");
    }

    console.log('Form data being submitted:', Object.fromEntries(formData.entries()));

    // Hide SaveBar since we're saving directly
    setSaveBarVisible(false);
    setCurrentSavingProductId(null);

    // Submit the form
    submit(formData, { method: "post" });
    shopify?.toast?.show("Saving configuration...", { duration: 2000 });
  };

  // SaveBar handlers
  const handleSaveBarSave = useCallback(() => {
    if (currentSavingProductId) {
      console.log('SaveBar Save clicked for product:', currentSavingProductId);

      const expandedProduct = expandedProducts[currentSavingProductId];
      if (!expandedProduct) return;

      // Use regular form submission logic
      setExpandedProducts(prev => ({
        ...prev,
        [currentSavingProductId]: { ...prev[currentSavingProductId], isSaving: true }
      }));

      // Filter out empty links before saving
      const validLinks = expandedProduct.externalLinks.filter(link => !isEmptyLink(link));

      const formData = new FormData();
      formData.set("actionType", "save");
      formData.set("productId", currentSavingProductId);
      formData.set("linkCount", validLinks.length.toString());

      // Add each valid external link's data
      validLinks.forEach((link, index) => {
        formData.set(`link_${index}_url`, link.url || "");
        formData.set(`link_${index}_text`, link.text || "");
        if (link.enabled) {
          formData.set(`link_${index}_enabled`, "on");
        }
      });

      // Hide ATC checkbox
      if (expandedProduct.hideAtc) {
        formData.set("hideAtc", "on");
      }

      submit(formData, { method: "post" });
      setSaveBarVisible(false);
      setCurrentSavingProductId(null);
      shopify?.toast?.show("Saving configuration...", { duration: 2000 });
    }
  }, [currentSavingProductId, expandedProducts, submit, shopify]);

  const handleSaveBarDiscard = useCallback(() => {
    console.log('SaveBar Discard clicked for product:', currentSavingProductId);

    if (currentSavingProductId) {
      // Find original product data to restore
      const originalProduct = configuredProducts.find(p => p.id === currentSavingProductId);

      if (originalProduct) {
        console.log('Restoring original data for product:', originalProduct.title);

        // Restore the expanded product state to original values
        setExpandedProducts(prev => ({
          ...prev,
          [currentSavingProductId]: {
            ...prev[currentSavingProductId],
            externalLinks: [...originalProduct.externalLinks], // Deep copy to reset to original external links
            hideAtc: originalProduct.hideAtc, // Reset hideAtc checkbox
            isSaving: false
          }
        }));

        console.log('State restored to original values');
      } else {
        console.log('No original product found for ID:', currentSavingProductId);
      }
    }

    setSaveBarVisible(false);
    setCurrentSavingProductId(null);
    shopify?.toast?.show("Changes discarded", { duration: 2000 });
  }, [currentSavingProductId, configuredProducts, shopify]);

  // Update external link in expanded product
  const updateExternalLink = (productId: string, index: number, field: keyof ExternalLink, value: string | boolean) => {
    console.log(`=== UPDATE EXTERNAL LINK ===`);
    console.log(`Product ID: ${productId}`);
    console.log(`Index: ${index}`);
    console.log(`Field: ${field}`);
    console.log(`Value: ${value} (type: ${typeof value})`);

    setExpandedProducts(prev => {
      if (!prev[productId]) {
        console.log(`ERROR: No expanded product found for ID: ${productId}`);
        return prev;
      }

      const currentProduct = prev[productId];
      console.log(`Current product state:`, currentProduct);
      console.log(`Current external links:`, currentProduct.externalLinks);

      const newState = {
        ...prev,
        [productId]: {
          ...prev[productId],
          externalLinks: prev[productId].externalLinks.map((link, i) => {
            if (i === index) {
              const updatedLink = { ...link, [field]: value };
              console.log(`Updating link ${i}:`, { from: link, to: updatedLink });
              return updatedLink;
            }
            return link;
          })
        }
      };

      console.log(`New product state:`, newState[productId]);
      console.log(`=== END UPDATE EXTERNAL LINK ===`);

      // Check if there are actual changes after the update to decide whether to show SaveBar
      // We need to check against the new state, so we'll do this after setting state
      return newState;
    });
  };

  // Show SaveBar when there are actual unsaved changes
  useEffect(() => {
    // Check if any product has unsaved changes
    const productWithChanges = Object.keys(expandedProducts).find(productId =>
      expandedProducts[productId]?.isExpanded && hasUnsavedChanges(productId)
    );

    if (productWithChanges && !saveBarVisible && !expandedProducts[productWithChanges]?.isSaving) {
      console.log('Showing SaveBar for product with changes:', productWithChanges);
      setSaveBarVisible(true);
      setCurrentSavingProductId(productWithChanges);
    } else if (!productWithChanges && saveBarVisible) {
      console.log('Hiding SaveBar - no products with changes');
      setSaveBarVisible(false);
      setCurrentSavingProductId(null);
    }
  }, [expandedProducts, configuredProducts, saveBarVisible]);

  // Add new external link (add to the beginning of the list)
  const addExternalLink = (productId: string) => {
    setExpandedProducts(prev => {
      if (!prev[productId]) return prev;
      return {
        ...prev,
        [productId]: {
          ...prev[productId],
          externalLinks: [{ url: "", text: "", enabled: true }, ...prev[productId].externalLinks]
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

      // Reset saving state for all products and update original state
      setExpandedProducts(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(productId => {
          updated[productId] = {
            ...updated[productId],
            isSaving: false,
            isEditing: false // Stop editing mode after successful save
          };
        });

        return updated;
      });

      // Clear selected product for edit after successful save
      setSelectedProductForEdit(null);

      // Show additional toast with cache note
      setTimeout(() => {
        shopify?.toast?.show("Tip: If changes don't appear immediately, try refreshing the product page", {
          duration: 4000
        });
      }, 2000);

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

  // Helper function to check if a link is empty (no URL - URL is required)
  const isEmptyLink = (link: ExternalLink): boolean => {
    return (!link.url || link.url.trim() === '');
  };

  // Function to check if there are any unsaved changes for a product
  const hasUnsavedChanges = (productId: string): boolean => {
    const expandedProduct = expandedProducts[productId];
    const originalProduct = configuredProducts.find(p => p.id === productId);

    if (!expandedProduct || !originalProduct) {
      return false;
    }

    // Check if hideAtc has changed
    if (expandedProduct.hideAtc !== originalProduct.hideAtc) {
      return true;
    }

    // Filter out empty links before comparison
    const currentLinks = expandedProduct.externalLinks.filter(link => !isEmptyLink(link));
    const originalLinks = originalProduct.externalLinks.filter(link => !isEmptyLink(link));

    // Check if arrays have different lengths (after filtering empty links)
    if (currentLinks.length !== originalLinks.length) {
      return true;
    }

    // Deep compare each non-empty link
    for (let i = 0; i < currentLinks.length; i++) {
      const current = currentLinks[i];
      const original = originalLinks[i];

      if (current.url !== original.url ||
        current.text !== original.text ||
        current.enabled !== original.enabled) {
        return true;
      }
    }

    return false;
  };

  return (
    <Page
      title="DC External Links"
      primaryAction={{
        content: isLoadingPicker ? "Selecting..." : "Add Products",
        onAction: handleOpenProductPicker,
        loading: isLoadingPicker,
        disabled: isLoadingPicker,
        icon: ProductIcon
      }}
    >
      <Layout>
        {/* Theme Setup Information - Show when setup is needed */}
        {(configuredProducts.length > 0 || !autoInstallNotificationDismissed) && (
          <Layout.Section>
            <Banner
              title="Theme Setup Required"
              tone="info"
              action={{
                content: 'Add to Theme',
                onAction: handleAutoAddBlock
              }}
            >
              <InlineStack align="space-between" blockAlign="start">
                <Text as="p" variant="bodyMd">
                  To display external buttons on your product pages, add the "External Button" block to your theme (one-time setup).
                </Text>
                <Button
                  variant="plain"
                  icon={XSmallIcon}
                  onClick={dismissAutoInstallNotification}
                  accessibilityLabel="Dismiss notification"
                />
              </InlineStack>
            </Banner>
          </Layout.Section>
        )}

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
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Product Configuration
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Add external affiliate links that will appear as buttons on your product pages
                  </Text>
                </BlockStack>
                <InlineStack gap="300" align="end">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="info">{`${configuredProducts.length} configured`}</Badge>
                  </InlineStack>
                  <InlineStack gap="300" align="center">
                    <Button
                      onClick={handleOpenProductPicker}
                      loading={isLoadingPicker}
                      variant="primary"
                      disabled={isLoadingPicker}
                      icon={isLoadingPicker ? SearchIcon : PlusIcon}
                    >
                      {isLoadingPicker ? 'Opening picker...' : 'Add Products'}
                    </Button>

                  </InlineStack>
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
                      <Form method="post">
                        <input type="hidden" name="actionType" value="save" />
                        <input type="hidden" name="productId" value={selectedProductForEdit.id} />
                        <input type="hidden" name="linkCount" value={expandedProducts[selectedProductForEdit.id]?.externalLinks?.length || 0} />

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
                                              Link {expandedProducts[selectedProductForEdit.id].externalLinks.length - index}
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
                                              label="Button text"
                                              name={`link_${index}_text`}
                                              value={link.text || ""}
                                              onChange={(value) => {
                                                updateExternalLink(selectedProductForEdit.id, index, "text", value);
                                              }}
                                              autoComplete="off"
                                              placeholder="Buy on Amazon"
                                              helpText="Text displayed on the button"
                                            />

                                            <TextField
                                              label="Destination URL"
                                              name={`link_${index}_url`}
                                              value={link.url || ""}
                                              onChange={(value) => {
                                                updateExternalLink(selectedProductForEdit.id, index, "url", value);
                                              }}
                                              autoComplete="off"
                                              placeholder="https://amazon.com/product/..."
                                              helpText="Full URL where the button should redirect"
                                            />

                                            <Checkbox
                                              label="Enable this button"
                                              name={`link_${index}_enabled`}
                                              checked={link.enabled}
                                              onChange={(checked) => {
                                                console.log(`=== CHECKBOX CHANGE NEW PRODUCT ===`);
                                                console.log(`Product ID: ${selectedProductForEdit.id}`);
                                                console.log(`Link index: ${index}`);
                                                console.log(`Current enabled state: ${link.enabled}`);
                                                console.log(`New checked state: ${checked}`);
                                                console.log(`Checkbox render checked state: ${link.enabled}`);
                                                updateExternalLink(selectedProductForEdit.id, index, "enabled", checked);

                                                // Show SaveBar when changes are made
                                                setSaveBarVisible(true);
                                                setCurrentSavingProductId(selectedProductForEdit.id);

                                                console.log(`=== END CHECKBOX CHANGE ===`);
                                              }}
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
                                  name="hideAtc"
                                  checked={expandedProducts[selectedProductForEdit.id]?.hideAtc || false}
                                  onChange={(checked) => {
                                    setExpandedProducts(prev => {
                                      const newState = {
                                        ...prev,
                                        [selectedProductForEdit.id]: {
                                          ...prev[selectedProductForEdit.id],
                                          hideAtc: checked
                                        }
                                      };

                                      // Show SaveBar when changes are made
                                      setSaveBarVisible(true);
                                      setCurrentSavingProductId(selectedProductForEdit.id);

                                      return newState;
                                    });
                                  }}
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
                      </Form>
                    )}
                  </BlockStack>
                </Card>
              )}

              {configuredProducts.length > 0 ? (
                <BlockStack gap="300">
                  {configuredProducts.map((product: Product) => (
                    <Card key={product.id}>
                      <BlockStack gap="400">
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
                                <InlineStack gap="100" blockAlign="center">
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
                          <Form method="post">
                            <input type="hidden" name="actionType" value="save" />
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="linkCount" value={expandedProducts[product.id]?.externalLinks?.length || 0} />

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
                                                  Link {expandedProducts[product.id].externalLinks.length - index}
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
                                                  label="Button text"
                                                  name={`link_${index}_text`}
                                                  value={link.text || ""}
                                                  onChange={(value) => {
                                                    updateExternalLink(product.id, index, "text", value);
                                                  }}
                                                  autoComplete="off"
                                                  placeholder="Buy on Amazon"
                                                  helpText="Text displayed on the button"
                                                />

                                                <TextField
                                                  label="Destination URL"
                                                  name={`link_${index}_url`}
                                                  value={link.url || ""}
                                                  onChange={(value) => {
                                                    updateExternalLink(product.id, index, "url", value);
                                                  }}
                                                  autoComplete="off"
                                                  placeholder="https://amazon.com/product/..."
                                                  helpText="Full URL where the button should redirect"
                                                />

                                                <Checkbox
                                                  label="Enable this button"
                                                  name={`link_${index}_enabled`}
                                                  checked={link.enabled}
                                                  onChange={(checked) => {
                                                    console.log(`=== CHECKBOX CHANGE EXISTING PRODUCT ===`);
                                                    console.log(`Product ID: ${product.id}`);
                                                    console.log(`Link index: ${index}`);
                                                    console.log(`Current enabled state: ${link.enabled}`);
                                                    console.log(`New checked state: ${checked}`);
                                                    console.log(`Checkbox render checked state: ${link.enabled}`);
                                                    console.log(`About to call updateExternalLink with:`, {
                                                      productId: product.id,
                                                      index,
                                                      field: "enabled",
                                                      value: checked,
                                                      valueType: typeof checked
                                                    });
                                                    updateExternalLink(product.id, index, "enabled", checked);

                                                    // Show SaveBar when changes are made

                                                    console.log(`=== END CHECKBOX CHANGE ===`);
                                                  }}
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
                                      name="hideAtc"
                                      checked={expandedProducts[product.id]?.hideAtc || false}
                                      onChange={(checked) => {
                                        setExpandedProducts(prev => {
                                          const newState = {
                                            ...prev,
                                            [product.id]: {
                                              ...prev[product.id],
                                              hideAtc: checked
                                            }
                                          };

                                          // Show SaveBar when changes are made
                                          setSaveBarVisible(true);
                                          setCurrentSavingProductId(product.id);

                                          return newState;
                                        });
                                      }}
                                      helpText="WARNING: This feature may not work with all themes. Test before publishing."
                                    />
                                  </BlockStack>
                                </Card>

                                {/* Action Buttons */}
                                <InlineStack gap="300" align="start">
                                  <Button
                                    variant="primary"
                                    onClick={() => {
                                      console.log(`=== SAVE BUTTON CLICKED ===`);
                                      console.log(`Product ID: ${product.id}`);
                                      console.log(`Current expanded state:`, expandedProducts[product.id]);
                                      saveProductConfiguration(product.id);
                                    }}
                                    loading={expandedProducts[product.id]?.isSaving}
                                    disabled={expandedProducts[product.id]?.isSaving || !hasUnsavedChanges(product.id)}
                                    icon={expandedProducts[product.id]?.isSaving ? ClockIcon : SaveIcon}
                                  >
                                    {expandedProducts[product.id]?.isSaving ? "Saving..." : "Save Changes"}
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
                          </Form>
                        )}
                      </BlockStack>
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
                      {isLoadingPicker ? "Selecting..." : "Configure first products"}
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
                <InlineStack gap="300" blockAlign="center">
                  <Badge tone="success">Active</Badge>
                  <Text as="p">App installed and running</Text>
                </InlineStack>
                <InlineStack gap="300" blockAlign="center">
                  <Badge tone="success">Ready</Badge>
                  <Text as="p">Theme extension available</Text>
                </InlineStack>
                <InlineStack gap="300" blockAlign="center">
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
                    </BlockStack>
                  </Card>

                  {/* Krok 2 */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="warning">Step 2</Badge>
                        <Text as="h3" variant="bodyLg" fontWeight="semibold">Add button block to theme</Text>
                      </InlineStack>
                      <Text as="p">
                        <strong>IMPORTANT:</strong> You need to add the "External Button" block to your product page in the theme editor.
                        This is a one-time setup required for the buttons to appear.
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        <strong>Quick setup:</strong> Use the "Auto-Add Button Block" button below to automatically open the theme editor with the block ready to add.
                      </Text>
                      <List type="bullet">
                        <List.Item><strong>Easy way:</strong> Click "Auto-Add Button Block" below</List.Item>
                        <List.Item><strong>Manual way:</strong> Go to Online Store → Themes → Customize</List.Item>
                        <List.Item>Navigate to a product page</List.Item>
                        <List.Item>Find the product form section</List.Item>
                        <List.Item>Click "Add block" and select "External Button"</List.Item>
                        <List.Item>Position the block where you want external buttons to appear</List.Item>
                        <List.Item>Save the theme</List.Item>
                      </List>
                      <InlineStack gap="200">
                        <Button
                          variant="primary"
                          onClick={handleAutoAddBlock}
                          icon={MagicIcon}
                        >
                          Auto-Add Button Block
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success">Step 3</Badge>
                        <Text as="h3" variant="bodyLg" fontWeight="semibold">Buttons will appear automatically</Text>
                      </InlineStack>
                      <Text as="p">
                        After adding the block to your theme, external buttons will automatically appear on configured product pages.
                        No additional setup required.
                      </Text>
                    </BlockStack>
                  </Card>

                  {/* Krok 3 */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success">Step 4</Badge>
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
                        How does the save functionality work?
                      </Text>
                      <Text as="p">
                        When you make changes to product configurations, Shopify automatically detects form changes and shows a contextual save bar at the top of the page.
                        The save bar appears automatically when you modify any form data and provides Save/Discard options.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        Why don't my changes appear immediately on the product page?
                      </Text>
                      <Text as="p">
                        Shopify uses caching to improve performance. After saving changes, it may take a few minutes for them to appear on the live product page.
                        You can use the "Force Refresh" button to open the product page with cache-busting parameters to see changes immediately.
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        The extension also automatically checks for updates every 30 seconds and will re-render buttons when new data is detected.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        Auto-Installation System
                      </Text>
                      <Text as="p">
                        <strong>NEW:</strong> The app now attempts to automatically add the button block to your theme when you configure your first product.
                      </Text>

                      {blockInstallationStatus === "error" && (
                        <>
                          <List type="bullet">
                            <List.Item>Go to Online Store → Themes → Customize</List.Item>
                            <List.Item>Navigate to any product page</List.Item>
                            <List.Item>Find the product form section (where Add to Cart button is)</List.Item>
                            <List.Item>Click "Add block" and select "External Button"</List.Item>
                            <List.Item>Position it where you want the external buttons to appear</List.Item>
                            <List.Item>Save the theme</List.Item>
                          </List>
                        </>
                      )}

                      <InlineStack gap="200">
                        <Button
                          variant="primary"
                          onClick={handleAutoAddBlock}
                          icon={MagicIcon}
                        >
                          Auto-Add Button Block
                        </Button>
                      </InlineStack>

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
                <Button variant="secondary" icon={EmailIcon}>
                  Report issue
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Spacer na dole strony */}
        <Layout.Section>
          <Box paddingBlockEnd="800"></Box>
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

      {/* New SaveBar component for manual control */}
      <SaveBar id="product-save-bar" open={saveBarVisible}>
        <button variant="primary" onClick={handleSaveBarSave}>
          Save
        </button>
        <button onClick={handleSaveBarDiscard}>
          Discard
        </button>
      </SaveBar>
    </Page>
  );
}