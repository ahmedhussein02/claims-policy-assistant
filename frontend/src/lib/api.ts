"use client";
import { useCallback } from "react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { API_SCOPE } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_CLAIMS_API_URL ?? "http://localhost:7071/api";

export type ClaimStatus = "Submitted" | "In Review" | "Action Required" | "Approved" | "Rejected";
export const STATUSES: ClaimStatus[] = ["Submitted", "In Review", "Action Required", "Approved", "Rejected"];

export interface ClaimSummary { claimId: string; claimType: string; status: ClaimStatus; submittedDate: string }
export interface ClaimDetail extends ClaimSummary { requiredDocuments: string[]; nextStep: string; createdAt: string; updatedAt: string }
export interface Page<T> { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number }

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Returns a fetcher that attaches a fresh access token to every request. */
export function useApi() {
  const { instance } = useMsal();
  return useCallback(
    async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
      if (!account) throw new ApiClientError(401, "unauthorized", "Please sign in.");

      let token: string;
      try {
        token = (await instance.acquireTokenSilent({ scopes: [API_SCOPE], account })).accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) {
          await instance.acquireTokenRedirect({ scopes: [API_SCOPE], account });
        }
        throw new ApiClientError(401, "unauthorized", "Your session expired. Please sign in again.");
      }

      let res: Response;
      try {
        res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        throw new ApiClientError(0, "network", "Could not reach the claims service.");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiClientError(res.status, body.error ?? "error", body.message ?? "Something went wrong.");
      }
      return res.json() as Promise<T>;
    },
    [instance]
  );
}
