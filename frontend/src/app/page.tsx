"use client";
import Link from "next/link";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { loginRequest } from "@/lib/auth";

export default function Home() {
  const { instance } = useMsal();
  const signedIn = useIsAuthenticated();
  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold">Insurance Claims Portal</h1>
      <p className="mt-2 max-w-xl text-gray-600">
        Track your claims securely. Sign in to view only your own claims, with the identity verified on the server.
      </p>
      {signedIn ? (
        <Link href="/claims" className="mt-6 inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">View my claims</Link>
      ) : (
        <button className="mt-6 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" onClick={() => instance.loginRedirect(loginRequest)}>
          Sign in to continue
        </button>
      )}
    </div>
  );
}
