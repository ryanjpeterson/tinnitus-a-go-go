import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth-context";

type State = "checking" | "ok" | "error";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const { user, refresh } = useAuth();

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("No token in URL.");
      return;
    }
    let cancelled = false;
    api
      .verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setState("ok");
        // Refresh /auth/me so emailVerifiedAt reflects in the auth context (best effort).
        refresh?.().catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Verification failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center">
        <Wordmark size="md" svg className="mx-auto mb-6" />

        {state === "checking" && (
          <p className="text-text-muted font-mono text-sm">Confirming…</p>
        )}

        {state === "ok" && (
          <>
            <h1 className="font-display uppercase text-3xl mb-3 text-accent-lime">
              You're verified.
            </h1>
            <p className="text-text-muted">
              Email confirmed. Now you can use password reset, in case you forget after a
              particularly loud show.
            </p>
            <Link
              to={user ? "/app" : "/login"}
              className="mt-6 inline-block rounded bg-accent-lime px-4 py-2 font-medium text-bg hover:bg-accent-lime/90"
            >
              {user ? "Back to the damage" : "Sign in"}
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="font-display uppercase text-3xl mb-3 text-accent-pink">
              Couldn't verify.
            </h1>
            <p className="text-text-muted font-mono text-sm">{message}</p>
            <Link
              to="/app"
              className="mt-6 inline-block text-sm text-accent-lime hover:underline"
            >
              Back to the app
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
