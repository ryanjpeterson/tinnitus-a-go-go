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
    <div className="flex min-h-full items-center justify-center px-4 pb-10 pt-[calc(2.5rem+env(safe-area-inset-top))]">
      <div className="card w-full max-w-md p-6 text-center sm:p-8">
        <Wordmark size="lg" svg className="mx-auto mb-6" />

        {state === "checking" && (
          <p className="meta">Confirming…</p>
        )}

        {state === "ok" && (
          <>
            <h1 className="h-page mb-3 text-accent-lime">
              You're verified.
            </h1>
            <p className="meta">
              Email confirmed. Now you can use password reset, in case you forget after a
              particularly loud show.
            </p>
            <Link
              to={user ? "/" : "/login"}
              className="mt-6 inline-block btn btn-primary"
            >
              {user ? "Back to the damage" : "Sign in"}
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="h-page mb-3 text-accent-pink">
              Couldn't verify.
            </h1>
            <p className="meta">{message}</p>
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
