"use client";

import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { logoutAction } from "@/app/(web)/error/actions.js";

export default function NoPermissionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // If you used "msg" as the param key:
  const customMsg = searchParams.get('msg') || null;

  const [logoutResult, doLogout, logoutPending] = useActionState(logoutAction, {});

  useEffect(() => {
    if (logoutResult?.success) {
      router.push("/");
    }
  }, [logoutResult, router]);

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Access Error</h2>

      {/* If we found a custom message, show it, otherwise show a default */}
      <p>{customMsg ?? "You do not have permission to view this page. Please contact support..."}</p>

      <div style={{ marginTop: "1rem" }}>
        {/* Button 1: Try Again */}
        <button
          style={{ marginRight: "1rem" }}
          onClick={() => {
            router.back();
          }}
        >
          Try Again
        </button>

        {/* Button 2: Go Home */}
        <button
          style={{ marginRight: "1rem" }}
          onClick={() => {
            router.push("/");
          }}
        >
          Go Home
        </button>

        {/* Button 3: Logout (inside a form) */}
        <form action={doLogout} style={{ display: "inline-block", marginRight: "1rem" }}>
          <button type="submit" disabled={logoutPending}>
            {logoutPending ? "Logging out..." : "Logout"}
          </button>
        </form>
      </div>
    </div>
  );
}
