/**
 * Account settings — password change, admin tools, and sign out.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ServicesPanel } from "@/components/ServicesPanel";
import { LinkCard, PageHeader } from "@/components/ui/kit";

export function AccountPage() {
  const { user, signOut } = useAuth();

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
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader eyebrow={`@${user?.username ?? ""}`} title="Account" />

      {/* Profile info — read-only */}
      <div className="card space-y-3 p-4 sm:p-5">
        <h2 className="h-section mb-3">Profile</h2>
        <div className="flex justify-between gap-3 text-[15px]">
          <span className="text-text-muted">Username</span>
          <span className="text-text-base">@{user?.username}</span>
        </div>
        <div className="flex justify-between gap-3 text-[15px]">
          <span className="text-text-muted">Email</span>
          <span className="text-text-base">{user?.email}</span>
        </div>
        {user?.isAdmin && (
          <div className="flex justify-between gap-3 text-[15px]">
            <span className="text-text-muted">Role</span>
            <span className="text-accent-lime text-sm">Admin</span>
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="card p-4 sm:p-5">
        <h2 className="h-section mb-4">Change password</h2>
        <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-muted">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="field h-12 w-full sm:h-11"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-muted">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="field h-12 w-full sm:h-11"
            />
            <p className="text-sm text-text-subtle mt-1">Minimum 12 characters</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-muted">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="field h-12 w-full sm:h-11"
            />
          </div>

          {error && <p className="text-sm text-accent-pink">{error}</p>}
          {success && <p className="text-sm text-accent-lime">Password updated.</p>}

          <button
            type="submit"
            disabled={saving}
            className="h-12 w-full sm:h-11 sm:w-auto sm:px-6 btn btn-primary"
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>

      {user?.isAdmin && (
        <>
          <div className="space-y-3">
            <h2 className="h-section px-0.5">Admin</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <LinkCard to="/admin/imports" eyebrow="Data" title="CSV imports" sub="Upload and track imports" />
              <LinkCard to="/admin/data" eyebrow="Data" title="Data cleanup" sub="Merge duplicates, fix gaps" />
            </div>
          </div>
          <ServicesPanel />
        </>
      )}

      {/* Sign out — the only sign-out control on mobile, where the header has no room for one */}
      <div className="space-y-3">
        <Button variant="secondary" onClick={() => void signOut()} className="h-12 w-full rounded-full text-[15px] text-accent-pink">
          Sign out
        </Button>
        <p className="text-center text-sm text-text-subtle">Tinnitus A Go Go · v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
