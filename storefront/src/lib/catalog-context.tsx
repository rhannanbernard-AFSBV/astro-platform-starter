"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Catalog, Product } from "./catalog-types";

type CatalogContextValue = {
  catalog: Catalog;
  products: Product[];
  setCatalog: (catalog: Catalog) => void;
  refreshFromServer: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({
  initial,
  children,
}: {
  initial: Catalog;
  children: ReactNode;
}) {
  const [catalog, setCatalog] = useState(initial);

  const refreshFromServer = useCallback(async () => {
    const res = await fetch("/api/placeholders", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not refresh catalog");
    const data = (await res.json()) as Catalog;
    setCatalog(data);
  }, []);

  const value = useMemo(
    () => ({
      catalog,
      products: catalog.products,
      setCatalog,
      refreshFromServer,
    }),
    [catalog, refreshFromServer],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
