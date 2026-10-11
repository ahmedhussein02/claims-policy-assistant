"use client";
import { useCallback } from "react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { API_SCOPE } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_CLAIMS_API_URL ?? "http://localhost:7071/api";
const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_API_URL ?? "http://localhost:3001";

export type ClaimStatus = "Submitted" | "In Review" | "Action Required" | "Approved" | "Rejected";
export const STATUSES: ClaimStatus[] = ["Submitted", "In Review", "Action Required", "Approved", "Rejected"];

export interface ClaimSummary { claimId: string; claimType: string; status: ClaimStatus; submittedDate: string }
export interface ClaimDetail extends ClaimSummary { requiredDocuments: string[]; nextStep: string; createdAt: string; updatedAt: string }
export interface Page<T> { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number }

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Returns a function that yields a fresh access token for the claims API (redirects to sign in if needed). */
export function useAccessToken() {
  const { instance } = useMsal();
  return useCallback(async (): Promise<string> => {
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
    if (!account) throw new ApiClientError(401, "unauthorized", "Please sign in.");
    try {
      return (await instance.acquireTokenSilent({ scopes: [API_SCOPE], account })).accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({ scopes: [API_SCOPE], account });
      }
      throw new ApiClientError(401, "unauthorized", "Your session expired. Please sign in again.");
    }
  }, [instance]);
}

async function request<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError(0, "network", "Could not reach the service.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiClientError(res.status, body.error ?? "error", body.message ?? "Something went wrong.");
  }
  return res.json() as Promise<T>;
}

/** Returns a fetcher for the claims API. */
export function useApi() {
  const getToken = useAccessToken();
  return useCallback(
    async <T,>(path: string, signal?: AbortSignal): Promise<T> => request<T>(`${API_URL}${path}`, await getToken(), { signal }),
    [getToken]
  );
}

export interface ChatSource { documentTitle: string; section: string }
export interface ChatReply { conversationId: string; intent: string; answer: string; sources: ChatSource[]; fallback: boolean }

/** Returns a function that sends one message to the chat endpoint. */
export function useChatApi() {
  const getToken = useAccessToken();
  return useCallback(
    async (message: string, conversationId?: string): Promise<ChatReply> =>
      request<ChatReply>(`${CHAT_URL}/chat`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
      }),
    [getToken]
  );
}
