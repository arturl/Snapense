import React, { useEffect, useState } from "react";
import {
  PublicClientApplication,
  EventType,
  type AuthenticationResult,
} from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./msalConfig";

const msalInstance = new PublicClientApplication(msalConfig);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    msalInstance.initialize().then(() => {
      msalInstance.handleRedirectPromise().then((response) => {
        if (response) {
          msalInstance.setActiveAccount(response.account);
        } else {
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
          }
        }
        setReady(true);
      });
    });

    msalInstance.addEventCallback((event) => {
      if (
        event.eventType === EventType.LOGIN_SUCCESS &&
        (event.payload as AuthenticationResult)?.account
      ) {
        msalInstance.setActiveAccount(
          (event.payload as AuthenticationResult).account
        );
      }
    });
  }, []);

  if (!ready) return <div style={{ padding: 40 }}>Loading...</div>;

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}

export { msalInstance };
