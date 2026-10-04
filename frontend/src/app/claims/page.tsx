"use client";
import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import ClaimsTable from "@/components/ClaimsTable";

export default function ClaimsPage() {
  return (
    <>
      <AuthenticatedTemplate>
        <h1 className="mb-4 text-xl font-semibold">My claims</h1>
        <ClaimsTable />
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <p className="text-gray-600">Please sign in to view your claims.</p>
      </UnauthenticatedTemplate>
    </>
  );
}
