"use client";

import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from "@azure/msal-react";
import ClaimsTable from "@/components/ClaimsTable";

export default function ClaimsPage() {
  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <AuthenticatedTemplate>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#475569] tracking-tight">
              My claims
            </h1>

            <p className="mt-1 text-[#475569] text-sm sm:text-base">
              View and manage all your submitted insurance claims.
            </p>
          </div>

          <ClaimsTable />
        </div>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <div className="bg-[#FFFFFF] rounded-2xl border border-slate-200/80 shadow-md p-8 text-center max-w-md mx-auto my-12">
          <p className="text-[#475569] text-sm font-medium">
            Please sign in to view your claims.
          </p>
        </div>
      </UnauthenticatedTemplate>
    </div>
  );
}