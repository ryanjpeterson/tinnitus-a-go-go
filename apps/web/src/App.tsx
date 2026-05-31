import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { LoginPage } from "@/routes/LoginPage";
import { SignupPage } from "@/routes/SignupPage";
import { AppShell } from "@/routes/AppShell";
import { RequireAdmin } from "@/routes/RequireAdmin";
import { ImportsPage } from "@/routes/ImportsPage";
import { CopyEditorPage } from "@/routes/CopyEditorPage";
import { VerifyEmailPage } from "@/routes/VerifyEmailPage";

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
            {/* Auth routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Admin-only routes */}
            <Route
              path="/admin/imports"
              element={
                <RequireAdmin>
                  <ImportsPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/copy"
              element={
                <RequireAdmin>
                  <CopyEditorPage />
                </RequireAdmin>
              }
            />

            {/* All routes go through AppShell (including /) */}
            <Route path="/*" element={<AppShell />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
