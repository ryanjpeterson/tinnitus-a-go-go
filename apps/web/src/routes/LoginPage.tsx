import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginSchema } from "@tagg/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Wordmark } from "@/components/Wordmark";

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your input.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.login(parsed.data);
      setUser(res.user);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Couldn't sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-block mb-8">
          <Wordmark size="md" svg />
        </Link>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-display tracking-tight uppercase">Sign in</h1>
            <p className="text-sm text-text-muted mt-1">
              Glad you're back. Hope the ringing's manageable.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="identifier">Username or email</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <Button type="submit" loading={submitting} className="w-full">
                I was there
              </Button>
            </form>

            <p className="mt-6 text-xs text-text-subtle">
              Don't have an account? Accounts are invite-only — get a link from a friend.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
