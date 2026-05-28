import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted font-mono text-sm">
        Checking the guest list…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center text-text-muted font-mono text-sm">
        VIP only. Talk to the admin if you think this is wrong.
      </div>
    );
  }
  return <>{children}</>;
}
