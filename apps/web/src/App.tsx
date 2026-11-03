import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { startOutbox } from "@/lib/outbox";
import { startUploads } from "@/lib/uploads";
import { useApplyBrand } from "@/lib/useBrand";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { LoginPage } from "@/routes/LoginPage";
import { SetupPage } from "@/routes/SetupPage";
import { AppShell } from "@/routes/AppShell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

/** Applies the brand theme (colours, favicon) — needs the query client, so it sits inside the provider. */
function BrandTheme(): null {
  useApplyBrand();
  return null;
}

export default function App() {
  // Send attendance edits made while offline, once the connection is back.
  useEffect(() => { startOutbox(queryClient); }, []);
  // Background uploads refresh show galleries as files land.
  useEffect(() => { startUploads(queryClient); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrandTheme />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />

            {/* All routes go through AppShell (including /) */}
            <Route path="/*" element={<AppShell />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
