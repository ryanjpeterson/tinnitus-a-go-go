import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, Loading } from "@/components/ui/kit";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking the guest list…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <EmptyState title="VIP only." body="Talk to the admin if you think this is wrong." />;
  return <>{children}</>;
}
