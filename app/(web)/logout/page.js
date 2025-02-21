"use client";
import React, { useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "./actions"; // We'll define in actions.js

// Optional if you want partial prerendering for any reason
// export const experimental_ppr = true;

export default function LogoutPage() {
  const router = useRouter();

  // 1) Wire up the logout action with useActionState
  //    This returns [stateOrResult, submitAction, isPending]
  const [logoutState, doLogout, logoutPending] = useActionState(logoutAction, {});

  // 2) If the logout is successful => redirect or show a message
  useEffect(() => {
    if (logoutState?.success) {
      // e.g. redirect to an un-auth page or login page
      router.replace("/");
    }
  }, [logoutState, router]);

  return (
    <div>
      <h1>Logout Required</h1>
      <p>For further process, you need to logout first.</p>

      <form action={doLogout}>
        <button type="submit" disabled={logoutPending}>
          {logoutPending ? "Logging out..." : "Logout"}
        </button>
      </form>

      {logoutState?.error && (
        <p style={{ color: "red" }}>{logoutState.message || "Logout error"}</p>
      )}
    </div>
  );
}
