"use client";
import { useEffect, useState } from "react";
import { createStandardPublicClientApplication, type IPublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { buildMsalConfig } from "@/lib/auth";

let pcaPromise: Promise<IPublicClientApplication> | undefined;

export default function Providers({ children }: { children: React.ReactNode }) {
  const [pca, setPca] = useState<IPublicClientApplication | null>(null);

  useEffect(() => {
    pcaPromise ??= createStandardPublicClientApplication(buildMsalConfig());
    pcaPromise.then((p) => {
      if (!p.getActiveAccount() && p.getAllAccounts().length) p.setActiveAccount(p.getAllAccounts()[0]);
      setPca(p);
    });
  }, []);

  if (!pca) return <p className="p-8 text-gray-500">Loading…</p>;
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
