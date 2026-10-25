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

  if (!pca) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="flex items-center gap-2.5 text-sm font-medium text-slate-500 bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-md">
        <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
        Loading authentication…
      </div>
    </div>
  );

  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}