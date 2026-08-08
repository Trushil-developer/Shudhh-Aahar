// src/context/AppConfigContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppConfig, DEFAULT_APP_CONFIG, fetchAppConfig } from '../services/appConfigService';

interface AppConfigContextType {
  config: AppConfig;
  loading: boolean;
  refetch: () => Promise<void>;
}

// Default context value uses DEFAULT_APP_CONFIG (fail-open) so any consumer
// rendered before the provider's fetch resolves — or outside a provider
// entirely — gets safe defaults, never undefined/a crash.
const AppConfigContext = createContext<AppConfigContextType>({
  config: DEFAULT_APP_CONFIG,
  loading: true,
  refetch: async () => {},
});

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // fetchAppConfig() never throws — it resolves to DEFAULT_APP_CONFIG on
    // any failure — so no try/catch is needed here.
    const result = await fetchAppConfig();
    setConfig(result);
    setLoading(false);
  };

  const refetch = async () => {
    await load();
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, loading, refetch }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export const useAppConfig = () => useContext(AppConfigContext);
