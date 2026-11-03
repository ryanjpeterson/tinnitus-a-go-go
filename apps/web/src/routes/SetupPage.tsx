import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { setupSchema } from "@tagg/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Wordmark } from "@/components/Wordmark";

/** First run: create the one account (the admin). Closed once it exists. */
export function SetupPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already set up: this page has nothing to do.
  useEffect(() => {
    void api.setupStatus().then((r) => { if (!r.needed) navigate("/login", { replace: true }); }).catch(() => {});
  }, [navigate]);

  const passwordStrength = useMemo(() => {
    if (password.length === 0) return null;
    if (password.length < 12) return { tone: "warn", msg: "At least 12 characters." };
    return { tone: "ok", msg: "Looks good." };
  }, [password]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = setupSchema.safeParse({
      username,
      email,
      password,
      displayName: displayName || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your input.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.setup(parsed.data);
      setUser(res.user);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Couldn't create the account. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 pb-10 pt-[calc(2.5rem+var(--safe-top))]">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <Wordmark size="lg" svg />
        </Link>

        <Card>
          <CardHeader>
            <h1 className="h-page">Set up</h1>
            <p className="meta mt-1.5">
              Fresh install. Make the account — it's the only one, and it runs the place.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  pattern="[a-zA-Z0-9_\-]+"
                  minLength={3}
                  maxLength={32}
                  required
                />
              </div>
              <div>
                <Label htmlFor="displayName">Display name (optional)</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={64}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <p className="mt-1.5 text-xs text-text-muted">Show reminders and the weekly recap go here.</p>
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {passwordStrength && (
                  <p
                    className={
                      "mt-1.5 text-xs " +
                      (passwordStrength.tone === "ok" ? "text-accent" : "text-text-muted")
                    }
                  >
                    {passwordStrength.msg}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <Button type="submit" loading={submitting} className="w-full" size="lg">
                Open the doors
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
