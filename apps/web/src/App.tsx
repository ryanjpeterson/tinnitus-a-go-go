import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { warmCache } from "@/lib/offline";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { LoginPage } from "@/routes/LoginPage";
import { SignupPage } from "@/routes/SignupPage";
import { AppShell } from "@/routes/AppShell";
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
  // Fill the offline cache with the main lists once per session.
  useEffect(() => { warmCache(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* All routes go through AppShell (including /) */}
            <Route path="/*" element={<AppShell />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
