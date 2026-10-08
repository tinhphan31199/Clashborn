"use client";

import { useSyncExternalStore } from "react";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";

/**
 * CopilotKit đọc `Date.now()` lúc render nên không prerender tĩnh được.
 * Chỉ mount provider ở client để `npm run build` qua được.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <>{children}</>;
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit">
      {children}
    </CopilotKitProvider>
  );
}
