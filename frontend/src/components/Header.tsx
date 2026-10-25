"use client";
import Link from "next/link";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "@/lib/auth";

export default function Header() {
  const { instance, accounts, inProgress } = useMsal();
  const signedIn = useIsAuthenticated();
  const busy = inProgress !== InteractionStatus.None;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4 shadow-lg">
      <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight text-white hover:text-blue-400 transition-colors">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <span className="text-lg">Claims Portal</span>
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {signedIn && (
          <Link href="/claims" className="font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer">
            My claims
          </Link>
        )}
        {signedIn && (
          <span className="text-xs sm:text-sm font-medium text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700/60">
            {accounts[0]?.name || accounts[0]?.username}
          </span>
        )}
        {signedIn ? (
          <button
            className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-1.5 text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            disabled={busy}
            onClick={() => instance.logoutRedirect({ account: accounts[0] })}
          >
            Sign out
          </button>
        ) : (
          <button
            className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-blue-500/20 active:scale-95"
            disabled={busy}
            onClick={() => instance.loginRedirect(loginRequest)}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}