import React, { createContext, useCallback, useContext, useState } from 'react';

type ContextValue = {
  refreshKey: number;
  invalidate: () => void;
};

const DataRefreshContext = createContext<ContextValue | null>(null);

export function DataRefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const invalidate = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);
  return (
    <DataRefreshContext.Provider value={{ refreshKey, invalidate }}>
      {children}
    </DataRefreshContext.Provider>
  );
}

export function useDataRefresh(): ContextValue {
  const ctx = useContext(DataRefreshContext);
  if (!ctx) {
    return {
      refreshKey: 0,
      invalidate: () => {},
    };
  }
  return ctx;
}
