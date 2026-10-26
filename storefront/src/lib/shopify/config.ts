export type ShopifyConfig = {
  enabled: boolean;
  storeDomain: string;
  storefrontToken: string;
  apiVersion: string;
  storefrontApiUrl: string;
};

export function getShopifyConfig(): ShopifyConfig {
  const storeDomain = (
    process.env.SHOPIFY_STORE_DOMAIN ||
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ||
    ""
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const storefrontToken = (
    process.env.SHOPIFY_STOREFRONT_TOKEN ||
    process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ||
    ""
  ).trim();
  const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
  const enabled = Boolean(storeDomain && storefrontToken);

  return {
    enabled,
    storeDomain,
    storefrontToken,
    apiVersion,
    storefrontApiUrl: enabled
      ? `https://${storeDomain}/api/${apiVersion}/graphql.json`
      : "",
  };
}
