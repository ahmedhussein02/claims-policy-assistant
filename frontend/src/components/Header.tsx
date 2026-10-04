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
    <header className="flex items-center justify-between border-b bg-white px-6 py-3">
      <Link href="/" className="font-semibold text-blue-700">Claims Portal</Link>
      <div className="flex items-center gap-4 text-sm">
        {signedIn && <Link href="/claims" className="hover:underline">My claims</Link>}
        {signedIn && <span className="text-gray-500">{accounts[0]?.name || accounts[0]?.username}</span>}
        {signedIn ? (
          <button className="rounded border px-3 py-1 hover:bg-gray-50" disabled={busy}
            onClick={() => instance.logoutRedirect({ account: accounts[0] })}>Sign out</button>
        ) : (
          <button className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50" disabled={busy}
            onClick={() => instance.loginRedirect(loginRequest)}>Sign in</button>
        )}
      </div>
    </header>
  );
}
