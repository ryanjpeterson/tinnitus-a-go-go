import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { LandingPage } from "@/routes/LandingPage";
import { LoginPage } from "@/routes/LoginPage";
import { SignupPage } from "@/routes/SignupPage";
import { AppShell } from "@/routes/AppShell";
import { RequireAuth } from "@/routes/RequireAuth";
import { RequireAdmin } from "@/routes/RequireAdmin";
import { ImportsPage } from "@/routes/ImportsPage";
import { CopyEditorPage } from "@/routes/CopyEditorPage";
import { VerifyEmailPage } from "@/routes/VerifyEmailPage";
import { PublicConcertPage } from "@/routes/PublicConcertPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/shows/:id" element={<PublicConcertPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route
              path="/app/admin/imports"
              element={
                <RequireAuth>
                  <RequireAdmin>
                    <ImportsPage />
                  </RequireAdmin>
                </RequireAuth>
              }
            />
            <Route
              path="/app/admin/copy"
              element={
                <RequireAuth>
                  <RequireAdmin>
                    <CopyEditorPage />
                  </RequireAdmin>
                </RequireAuth>
              }
            />
            <Route
              path="/app/*"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={
                <div className="flex h-full items-center justify-center p-10 text-text-muted font-mono text-sm">
                  Wrong venue, pal.
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
