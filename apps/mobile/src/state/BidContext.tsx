import React, { createContext, useContext, useMemo, useState } from 'react';
import type { ScanResponse } from '../api/client';

type BidContextValue = {
  scan: ScanResponse | null;
  setScan: (s: ScanResponse | null) => void;
  /** Local capture URIs for calibrate visual review (not uploaded again). */
  captureUris: string[];
  setCaptureUris: (uris: string[]) => void;
};

const BidContext = createContext<BidContextValue | undefined>(undefined);

export function BidProvider({ children }: { children: React.ReactNode }) {
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [captureUris, setCaptureUris] = useState<string[]>([]);
  const value = useMemo(
    () => ({ scan, setScan, captureUris, setCaptureUris }),
    [scan, captureUris]
  );
  return <BidContext.Provider value={value}>{children}</BidContext.Provider>;
}

export function useBid() {
  const ctx = useContext(BidContext);
  if (!ctx) throw new Error('useBid must be used within BidProvider');
  return ctx;
}
