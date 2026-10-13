import React, { createContext, useContext, useMemo, useState } from 'react';
import type { ScanResponse } from '../api/client';

type BidContextValue = {
  scan: ScanResponse | null;
  setScan: (s: ScanResponse | null) => void;
};

const BidContext = createContext<BidContextValue | undefined>(undefined);

export function BidProvider({ children }: { children: React.ReactNode }) {
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const value = useMemo(() => ({ scan, setScan }), [scan]);
  return <BidContext.Provider value={value}>{children}</BidContext.Provider>;
}

export function useBid() {
  const ctx = useContext(BidContext);
  if (!ctx) throw new Error('useBid must be used within BidProvider');
  return ctx;
}
