import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// The outbox keeps its queue in localStorage and listens for "online".
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal("window", { addEventListener: () => {} });
vi.stubGlobal("navigator", { onLine: false });

const { enqueue, outboxCount, queueable, startOutbox } = await import("@/lib/outbox");

const SHOW = "5a7bd21d-d7ec-43f7-b95c-e7c535d183fb";

describe("offline attendance edits (outbox)", () => {
  beforeEach(() => store.clear());

  it("queues only attendance edits", () => {
    expect(queueable(`/concerts/${SHOW}`, "PATCH", JSON.stringify({ status: "attended", personalNotes: "loud" }))).toBe(true);
    expect(queueable(`/concerts/${SHOW}`, "PATCH", JSON.stringify({ date: "2024-01-01" }))).toBe(false);
    expect(queueable(`/concerts/${SHOW}`, "DELETE", JSON.stringify({ status: "attended" }))).toBe(false);
    expect(queueable("/festivals/bluesfest-2025/attendance", "PATCH", JSON.stringify({ status: "attended" }))).toBe(true);
    expect(queueable("/concerts", "POST", JSON.stringify({ status: "attended" }))).toBe(false);
  });

  it("keeps the edit on the device and shows it on the loaded show page", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["concerts", SHOW], { concert: { id: SHOW, status: "attending", attendance: { status: "attending", personalNotes: null } } });
    startOutbox(qc); // offline: nothing is sent

    await enqueue(`/concerts/${SHOW}`, "PATCH", JSON.stringify({ status: "attended" }));

    expect(outboxCount()).toBe(1);
    expect(qc.getQueryData(["concerts", SHOW])).toMatchObject({
      concert: { status: "attended", attendance: { status: "attended", personalNotes: null } },
    });
  });
});
