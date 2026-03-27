import { Configuration, LogLevel } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID;

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
    },
  },
};

/** Scopes for login — we need Graph API access for OneDrive */
export const loginRequest = {
  scopes: ["openid", "profile", "email", "Files.ReadWrite", "User.Read"],
};

/** Scopes for Graph API token acquisition */
export const graphScopes = {
  scopes: ["Files.ReadWrite", "User.Read"],
};
