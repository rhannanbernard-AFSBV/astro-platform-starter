import { getShopifyConfig } from "./config";

type ShopifyUserError = { field?: string[] | null; message: string };

async function storefrontFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const config = getShopifyConfig();
  if (!config.enabled) {
    throw new Error(
      "Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN.",
    );
  }

  const response = await fetch(config.storefrontApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": config.storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Shopify Storefront HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }
  if (!payload.data) {
    throw new Error("Shopify Storefront returned no data");
  }
  return payload.data;
}

const CART_CREATE = /* GraphQL */ `
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function createShopifyCheckout(lines: {
  merchandiseId: string;
  quantity: number;
}[]): Promise<{ checkoutUrl: string; cartId: string }> {
  if (!lines.length) {
    throw new Error("Cart is empty");
  }

  const data = await storefrontFetch<{
    cartCreate: {
      cart: { id: string; checkoutUrl: string } | null;
      userErrors: ShopifyUserError[];
    };
  }>(CART_CREATE, {
    input: {
      lines: lines.map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
      })),
    },
  });

  const errors = data.cartCreate.userErrors;
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  const cart = data.cartCreate.cart;
  if (!cart?.checkoutUrl) {
    throw new Error("Shopify did not return a checkout URL");
  }
  return { checkoutUrl: cart.checkoutUrl, cartId: cart.id };
}

export function shopifyStatus() {
  const config = getShopifyConfig();
  return {
    enabled: config.enabled,
    storeDomain: config.storeDomain || null,
    apiVersion: config.apiVersion,
  };
}
