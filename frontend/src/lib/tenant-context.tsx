"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { BusinessProfile, TenantRole } from "./types";
import type { TenantHeaders } from "./api";

/** Stub Master Account → business profiles (Pillar 3 white-label switch). */
export const STUB_PROFILES: BusinessProfile[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Allyanna Master Account",
    userId: "22222222-2222-2222-2222-222222222222",
    role: "external_accountant",
    kind: "master",
  },
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Philipsburg Harbor Trading N.V.",
    userId: "33333333-3333-3333-3333-333333333333",
    role: "owner",
    kind: "business",
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Simpson Bay Marina Services",
    userId: "44444444-4444-4444-4444-444444444444",
    role: "owner",
    kind: "business",
  },
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    name: "Cole Bay Retail Group",
    userId: "55555555-5555-5555-5555-555555555555",
    role: "employee",
    kind: "business",
  },
];

interface TenantContextValue {
  profiles: BusinessProfile[];
  active: BusinessProfile;
  setActiveId: (id: string) => void;
  headers: TenantHeaders;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState(STUB_PROFILES[1].id);

  const active = useMemo(
    () => STUB_PROFILES.find((p) => p.id === activeId) ?? STUB_PROFILES[0],
    [activeId],
  );

  const setActive = useCallback((id: string) => {
    if (STUB_PROFILES.some((p) => p.id === id)) {
      setActiveId(id);
    }
  }, []);

  const headers: TenantHeaders = useMemo(
    () => ({
      tenantId: active.id,
      userId: active.userId,
      role: active.role as TenantRole,
    }),
    [active],
  );

  const value = useMemo(
    () => ({
      profiles: STUB_PROFILES,
      active,
      setActiveId: setActive,
      headers,
    }),
    [active, setActive, headers],
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
