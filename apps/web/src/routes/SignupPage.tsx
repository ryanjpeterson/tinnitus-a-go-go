import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signupSchema } from "@tagg/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Wordmark } from "@/components/Wordmark";

type InviteState = "checking" | "valid" | "invalid" | "missing";

export function SignupPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteCode = params.get("invite") ?? "";

  const [inviteState, setInviteState] = useState<InviteState>(
    inviteCode ? "checking" : "missing",
  );

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!inviteCode) {
      setInviteState("missing");
      return;
    }
    setInviteState("checking");
    api
      .checkInvite(inviteCode)
      .then((res) => {
        if (!cancelled) setInviteState(res.valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setInviteState("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const passwordStrength = useMemo(() => {
    if (password.length === 0) return null;
    if (password.length < 12) return { tone: "warn", msg: "At least 12 characters." };
    return { tone: "ok", msg: "Looks good." };
  }, [password]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = signupSchema.safeParse({
      username,
      email,
      password,
      inviteCode,
      displayName: displayName || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your input.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.signup(parsed.data);
      setUser(res.user);
      navigate("/app", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Couldn't create the account. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-block mb-8">
          <Wordmark size="md" svg />
        </Link>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-display tracking-tight uppercase">Create an account</h1>
            <p className="text-sm text-text-muted mt-1">
              Welcome to the lineup. This site is invite-only.
            </p>
            <InviteBadge state={inviteState} />
          </CardHeader>
          <CardContent>
            {inviteState === "missing" && (
              <p className="text-sm text-text-muted">
                You need a valid invite link to sign up. Ask a friend who already has an account
                to send you one. Then come back here with the link.
              </p>
            )}
            {inviteState === "invalid" && (
              <p className="text-sm text-danger">
                That invite link is invalid or has already been used. Ask for a fresh one.
              </p>
            )}
            {inviteState === "valid" && (
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
                        (passwordStrength.tone === "ok" ? "text-accent-lime" : "text-text-muted")
                      }
                    >
                      {passwordStrength.msg}
                    </p>
                  )}
                </div>

                {error && (
                  <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </div>
                )}

                <Button type="submit" loading={submitting} className="w-full">
                  Sign me up
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function InviteBadge({ state }: { state: InviteState }) {
  if (state === "checking") {
    return (
      <span className="tag-pill mt-3 bg-surface-2 text-text-muted">checking invite…</span>
    );
  }
  if (state === "valid") {
    return (
      <span className="tag-pill mt-3 bg-accent-lime/15 text-accent-lime border border-accent-lime/30">
        invite valid
      </span>
    );
  }
  if (state === "invalid") {
    return (
      <span className="tag-pill mt-3 bg-danger/15 text-danger border border-danger/30">
        invite invalid
      </span>
    );
  }
  return (
    <span className="tag-pill mt-3 bg-surface-2 text-text-muted border border-border">
      no invite code
    </span>
  );
}
