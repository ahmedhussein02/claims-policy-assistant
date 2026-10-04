import type { Configuration } from "@azure/msal-browser";

const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID ?? "";
const authority = process.env.NEXT_PUBLIC_ENTRA_AUTHORITY ?? "";

export const API_SCOPE = process.env.NEXT_PUBLIC_ENTRA_API_SCOPE ?? "";
export const loginRequest = { scopes: [API_SCOPE] };

export function buildMsalConfig(): Configuration {
  return {
    auth: {
      clientId,
      authority,
      knownAuthorities: authority ? [new URL(authority).host] : [],
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: { cacheLocation: "sessionStorage" },
  };
}
