import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session };

const AuthContext = createContext<AuthState>({ status: "loading" });

/** Follows Auth's stored session; screens read it with `useAuth`. */
export function AuthProvider({
  client,
  children,
}: {
  client: SupabaseClient;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    // INITIAL_SESSION arrives first with whatever is stored (or nothing),
    // then every sign-in, refresh and sign-out.
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setState(
        session ? { status: "signedIn", session } : { status: "signedOut" },
      );
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
