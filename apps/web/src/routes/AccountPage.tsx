/**
 * Account settings — password change.
 */

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

export function AccountPage() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="font-display uppercase text-3xl mb-1">Account</h1>
      <p className="text-sm text-text-muted mb-8">@{user?.username}</p>

      {/* Profile info — read-only */}
      <div className="rounded-lg border border-border bg-surface p-5 mb-6 space-y-3">
        <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">Profile</div>
        <div className="flex justify-between text-sm">
          <span className="text-text-muted font-mono">Username</span>
          <span className="text-text-base font-mono">@{user?.username}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-muted font-mono">Email</span>
          <span className="text-text-base font-mono">{user?.email}</span>
        </div>
        {user?.isAdmin && (
          <div className="flex justify-between text-sm">
            <span className="text-text-muted font-mono">Role</span>
            <span className="text-accent-lime font-mono text-xs">Admin</span>
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-4">Change password</div>
        <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime"
            />
            <p className="text-xs text-text-subtle mt-1 font-mono">Minimum 12 characters</p>
          </div>
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime"
            />
          </div>

          {error && <p className="text-xs font-mono text-accent-pink">{error}</p>}
          {success && <p className="text-xs font-mono text-accent-lime">Password updated.</p>}

          <button
            type="submit"
            disabled={saving}
            className="text-xs font-mono px-4 py-2 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
