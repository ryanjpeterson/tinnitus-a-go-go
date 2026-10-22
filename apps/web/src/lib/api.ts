import type { UserPublic, AttendanceStatus } from "@tagg/shared";
import { enqueue, queueable } from "./outbox";

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { rawBody?: boolean } = {},
): Promise<T> {
  const { rawBody, ...rest } = init;
  // For multipart uploads we let the browser set Content-Type with the boundary.
  // For DELETE/GET (no body), omit Content-Type entirely — sending
  // Content-Type: application/json with an empty body triggers Fastify's JSON
  // parser to return 400.
  const hasBody = rest.body != null;
  const headers: Record<string, string> = rawBody
    ? { ...(rest.headers as Record<string, string> | undefined) }
    : {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers as Record<string, string> | undefined),
      };
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "include",
      headers,
      ...rest,
    });
  } catch (err) {
    // No connection: attendance edits wait on the device (see lib/outbox.ts).
    const method = (rest.method ?? "GET").toUpperCase();
    if (queueable(path, method, rest.body)) {
      await enqueue(path, method, rest.body as string);
      return { ok: true, queued: true } as T;
    }
    throw err;
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    const msg =
      (body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : null) ?? res.statusText ?? "Request failed";
    throw new ApiError(msg, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  signup: (body: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
    displayName?: string;
  }) => request<{ user: UserPublic }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { identifier: string; password: string }) =>
    request<{ user: UserPublic }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>("/auth/password", { method: "PATCH", body: JSON.stringify(body) }),
  me: () => request<{ user: UserPublic }>("/auth/me"),
  checkInvite: (code: string) =>
    request<{ valid: boolean }>(`/invites/check?code=${encodeURIComponent(code)}`),
  verifyEmail: (token: string) =>
    request<{ ok: true }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  health: () => request<{ ok: boolean }>("/health"),

  // Concerts
  listConcerts: (params?: {
    /** One status, or several (sent comma-separated). */
    status?: AttendanceStatus | AttendanceStatus[];
    year?: number;
    q?: string;
    sort?: "date_desc" | "date_asc";
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status && params.status.length > 0) {
      qs.set("status", Array.isArray(params.status) ? params.status.join(",") : params.status);
    }
    if (params?.year) qs.set("year", String(params.year));
    if (params?.q) qs.set("q", params.q);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<ConcertListResponse>(`/concerts${query}`);
  },
  concertStats: () => request<ConcertStatsResponse>("/concerts/stats"),
  listFollowup: () => request<{ concerts: ConcertListItem[]; total: number }>("/concerts/followup"),
  getConcert: (id: string) => request<ConcertDetailResponse>(`/concerts/${id}`),
  patchConcert: (
    id: string,
    body: {
      // Attendance (per-user)
      status?: AttendanceStatus;
      personalNotes?: string | null;
      ticketPricePaid?: number | null;
      ticketPriceCurrency?: string | null;
      // Concert (shared)
      date?: string;
      dateIsApproximate?: boolean;
      type?: "concert" | "festival_day";
      venueName?: string;
      venueCity?: string | null;
      venueRegion?: string | null;
      eventSeriesName?: string | null;
      eventSeriesYear?: number | null;
      eventNotes?: string | null;
      sourceUrl?: string | null;
    },
  ) => request<{ ok: true }>(`/concerts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  batchPatchConcerts: (
    updates: Array<{
      id: string;
      // attendance
      status?: AttendanceStatus;
      personalNotes?: string | null;
      ticketPricePaid?: number | null;
      ticketPriceCurrency?: string | null;
      // concert-level
      date?: string;
      type?: "concert" | "festival_day";
      venueName?: string;
      venueCity?: string | null;
    }>,
  ) => request<{ ok: true; updated: number }>("/concerts/batch", { method: "PATCH", body: JSON.stringify({ updates }) }),

  // Public (no auth)
  listPublicConcerts: () =>
    request<PublicConcertListResponse>("/public/concerts"),
  getPublicConcert: (id: string) =>
    request<{ concert: PublicConcertDetail }>(`/public/concerts/${id}`),
  // Calendar feed (private subscribe link)
  getCalendarToken: () => request<{ token: string }>("/calendar/token"),
  resetCalendarToken: () => request<{ token: string }>("/calendar/token/reset", { method: "POST" }),
  // Push notifications
  getPushKey: () => request<{ publicKey: string }>("/push/key"),
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: true }>("/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  unsubscribePush: (endpoint: string) =>
    request<{ ok: true }>("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  testPush: () => request<{ ok: true; delivered: number }>("/push/test", { method: "POST" }),
  getPushPrefs: () => request<{ prefs: PushPrefs }>("/push/prefs"),
  setPushPrefs: (prefs: PushPrefs) => request<{ prefs: PushPrefs }>("/push/prefs", { method: "PUT", body: JSON.stringify(prefs) }),
  /** Mark a photo as a ticket stub (or back to a photo). */
  setPhotoKind: (photoId: string, kind: "photo" | "ticket") =>
    request<{ ok: true }>(`/photos/${photoId}`, { method: "PATCH", body: JSON.stringify({ kind }) }),
  /** Every ticket stub, oldest show first. */
  listTickets: () => request<{ tickets: TicketStub[] }>("/photos/tickets"),
  /** Everything searchable, filtered on the device (kept offline by the service worker). */
  getSearchIndex: () => request<SearchIndex>("/search/index"),
  getDeepStats: (localDate?: string) =>
    request<DeepStatsResponse>(
      `/concerts/deep-stats${localDate ? `?localDate=${encodeURIComponent(localDate)}` : ""}`,
    ),
  listReviewYears: () =>
    request<{ years: YearCount[] }>("/concerts/year-review"),
  getYearReview: (year: number) =>
    request<YearReviewResponse>(`/concerts/year-review/${year}`),
  getSiteCopy: () =>
    request<{ copy: Record<string, string> }>("/public/copy"),

  // Admin: CMS copy editor
  adminGetCopy: () =>
    request<{ items: CopyItem[] }>("/admin/copy"),
  adminPatchCopyKey: (key: string, value: string) =>
    request<{ item: CopyItem }>(`/admin/copy/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    }),
  createConcert: (body: {
    date: string;
    dateIsApproximate?: boolean;
    type?: "concert" | "festival_day";
    venueName: string;
    venueCity?: string;
    venueRegion?: string;
    eventSeriesName?: string;
    eventSeriesYear?: number;
    artists: Array<{ name: string; role?: string; setOrder?: number }>;
    status?: string;
    personalNotes?: string;
    ticketPricePaid?: number;
    ticketPriceCurrency?: string;
    eventNotes?: string;
    sourceUrl?: string;
  }) =>
    request<{ concertId: string; slug: string | null }>("/concerts", { method: "POST", body: JSON.stringify(body) }),
  putConcertArtists: (
    concertId: string,
    artists: Array<{
      artistId?: string;
      artistName?: string;
      role: string;
      setOrder?: number | null;
      appearanceNotes?: string | null;
    }>,
  ) =>
    request<{ ok: true }>(`/concerts/${concertId}/artists`, {
      method: "PUT",
      body: JSON.stringify({ artists }),
    }),
  deleteConcert: (id: string) =>
    request<void>(`/concerts/${id}`, { method: "DELETE" }),
  /** Download the log as CSV (re-importable), JSON or Markdown. */
  exportLog: (format: ExportFormat) =>
    fetch(`/api/users/me/export.${format}`, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("Export failed");
      return r.blob();
    }),

  // Photos
  listPhotos: (concertId: string) =>
    request<{ photos: PhotoItem[] }>(`/concerts/${concertId}/photos`),
  uploadPhoto: (
    concertId: string,
    file: File,
    onProgress?: (pct: number) => void,
    /** Aborting cancels the upload in flight (used to pause the upload queue). */
    signal?: AbortSignal,
  ): Promise<{ photoId: string; objectKey: string }> => {
    // Wraps the XHR in a retry loop: if the server returns 429 (rate limited)
    // we wait 6 seconds and try once more before surfacing the error.
    const attempt = (): Promise<{ photoId: string; objectKey: string }> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const form = new FormData();
        form.append("file", file, file.name);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as { photoId: string; objectKey: string });
            } catch {
              reject(new ApiError("Invalid response", xhr.status));
            }
          } else {
            let errMsg = "Upload failed";
            try {
              const body = JSON.parse(xhr.responseText) as { error?: string };
              if (body.error) errMsg = body.error;
            } catch { /* not JSON */ }
            reject(new ApiError(errMsg, xhr.status));
          }
        });

        xhr.addEventListener("error", () => reject(new ApiError("Network error during upload", 0)));
        xhr.addEventListener("abort", () => reject(new ApiError("Upload cancelled", 0)));

        if (signal?.aborted) { reject(new ApiError("Upload cancelled", 0)); return; }
        signal?.addEventListener("abort", () => xhr.abort(), { once: true });
        xhr.open("POST", `/api/concerts/${concertId}/photos`);
        xhr.withCredentials = true;
        xhr.send(form);
      });

    return attempt().catch(async (err: unknown) => {
      if (err instanceof ApiError && err.status === 429) {
        // Rate limited — back off 6 s then retry once
        await new Promise((r) => setTimeout(r, 6000));
        return attempt();
      }
      throw err;
    });
  },
  deletePhoto: (photoId: string) =>
    request<void>(`/photos/${photoId}`, { method: "DELETE" }),
  putPhotoOrder: (concertId: string, order: string[]) =>
    request<{ ok: true }>(`/concerts/${concertId}/photos/order`, {
      method: "PUT",
      body: JSON.stringify({ order }),
    }),
  tagPhotoArtists: (photoId: string, artistIds: string[]) =>
    request<{ ok: true; photoId: string; artistIds: string[] }>(`/photos/${photoId}/artists`, {
      method: "PUT",
      body: JSON.stringify({ artistIds }),
    }),
  getPhotoArtists: (photoId: string) =>
    request<{ artists: PhotoArtistTag[] }>(`/photos/${photoId}/artists`),

  // Artists
  listArtists: (params?: { q?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<ArtistListResponse>(`/artists${query}`);
  },
  getArtist: (slug: string) => request<ArtistDetailResponse>(`/artists/${slug}`),
  getArtistPhotos: (slug: string) => request<ArtistPhotosResponse>(`/artists/${slug}/photos`),
  patchArtist: (
    slug: string,
    body: { name?: string; genre?: string | null; bio?: string | null; mbid?: string | null },
  ) => request<{ ok: true; slug: string }>(`/artists/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
  uploadArtistImage: async (slug: string, file: File): Promise<{ imageUrl: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/artists/${slug}/image`, { method: "POST", body: fd, credentials: "include" });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error ?? "Upload failed"); }
    return res.json() as Promise<{ imageUrl: string }>;
  },
  uploadArtistImageFromUrl: (slug: string, url: string) =>
    request<{ imageUrl: string }>(`/artists/${slug}/image/url`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  deleteArtistImage: (slug: string) =>
    request<void>(`/artists/${slug}/image`, { method: "DELETE" }),
  enrichArtist: (
    slug: string,
    options?: {
      updateBio?: boolean;
      updateGenre?: boolean;
      updateImage?: boolean;
      updateMbid?: boolean;
      overwrite?: boolean;
    },
  ) =>
    request<ArtistEnrichmentResponse>(`/artists/${slug}/enrich`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }),
  queueArtistEnrich: (slug: string) =>
    request<{ ok: boolean; queued: boolean }>(`/artists/${slug}/enrich/queue`, {
      method: "POST",
    }),
  bulkEnrichArtists: (options?: {
    missingBio?: boolean;
    missingImage?: boolean;
    missingGenre?: boolean;
    limit?: number;
  }) =>
    request<{ ok: boolean; queued: number; total: number }>("/artists/enrich/bulk", {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }),

  // Venues
  listVenues: (params?: { q?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<VenueListResponse>(`/venues${query}`);
  },
  listVenuesForMap: () => request<VenueMapResponse>("/venues/map"),
  getVenue: (slug: string) => request<VenueDetailResponse>(`/venues/${slug}`),
  patchVenue: (
    slug: string,
    body: { name?: string; city?: string | null; region?: string | null; country?: string | null; lat?: number | null; lng?: number | null; capacity?: number | null },
  ) => request<{ ok: true; slug: string }>(`/venues/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
  addVenueAlias: (
    slug: string,
    body: { name: string; activeFrom?: string | null; activeUntil?: string | null; notes?: string | null },
  ) => request<{ ok: true; alias: VenueAlias }>(`/venues/${slug}/aliases`, { method: "POST", body: JSON.stringify(body) }),
  deleteVenueAlias: (slug: string, aliasId: string) =>
    request<{ ok: true }>(`/venues/${slug}/aliases/${aliasId}`, { method: "DELETE" }),

  // URL paste parser
  // Admin data cleanup
  dataDuplicates: (type: DataEntityType) =>
    request<{ groups: DupGroup[] }>(`/admin/data/duplicates?type=${type}`),
  dataMergePreview: (type: DataEntityType, keepId: string, removeId: string) =>
    request<MergePreview>(`/admin/data/merge-preview?type=${type}&keepId=${keepId}&removeId=${removeId}`),
  dataMerge: (type: DataEntityType, keepId: string, removeIds: string[]) =>
    request<{ ok: true; merged: string[] }>("/admin/data/merge", { method: "POST", body: JSON.stringify({ type, keepId, removeIds }) }),
  dataDismiss: (type: DataEntityType, ids: string[]) =>
    request<{ ok: true }>("/admin/data/dismiss", { method: "POST", body: JSON.stringify({ type, ids }) }),
  dataMerges: () => request<{ merges: MergeLogEntry[] }>("/admin/data/merges"),
  dataUndoMerge: (id: string) => request<{ ok: true }>(`/admin/data/merges/${id}/undo`, { method: "POST" }),
  dataHealth: () => request<{ checks: HealthCheck[] }>("/admin/data/health"),
  dataHealthFix: (check: string, value?: string, to?: string) =>
    request<{ ok: true; changed: number }>("/admin/data/health/fix", { method: "POST", body: JSON.stringify({ check, value, to }) }),
  setlistFinderStatus: () => request<SetlistFinderStatus>("/admin/data/setlist-finder"),
  setlistFinderRun: () => request<{ ok: true }>("/admin/data/setlist-finder/run", { method: "POST" }),
  dataSimilar: (type: DataEntityType, name: string, city?: string) => {
    const qs = new URLSearchParams({ type, name });
    if (city) qs.set("city", city);
    return request<{ matches: DupRecord[] }>(`/admin/data/similar?${qs}`);
  },
  parseEventUrl: (url: string) =>
    request<ParsedEvent>("/concerts/parse-url", { method: "POST", body: JSON.stringify({ url }) }),

  // Series (legacy - for backward compatibility with tour names)
  patchSeries: (slug: string, body: { name?: string; year?: number | null }) =>
    request<{ series: { id: string; name: string; slug: string; year: number | null } }>(
      `/series/${slug}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  // Festivals (first-class entities)
  listFestivals: (params?: {
    status?: AttendanceStatus;
    year?: number;
    q?: string;
    sort?: "date_desc" | "date_asc" | "name_asc";
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.year) qs.set("year", String(params.year));
    if (params?.q) qs.set("q", params.q);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<FestivalListResponse>(`/festivals${query}`);
  },
  getFestival: (slug: string) => request<FestivalDetailResponse>(`/festivals/${slug}`),
  createFestival: (body: {
    name: string;
    year?: number;
    startDate?: string;
    endDate?: string;
    venueName?: string;
    venueCity?: string;
    venueRegion?: string;
    eventNotes?: string;
    sourceUrl?: string;
    status?: AttendanceStatus;
    personalNotes?: string;
    ticketPricePaid?: number;
    ticketPriceCurrency?: string;
    artists?: Array<{
      name: string;
      performanceDate?: string;
      stageName?: string;
      setOrder?: number;
      appearanceNotes?: string;
    }>;
  }) =>
    request<{ festivalId: string; slug: string }>("/festivals", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchFestival: (
    slug: string,
    body: {
      name?: string;
      year?: number | null;
      startDate?: string | null;
      endDate?: string | null;
      venueName?: string;
      venueCity?: string | null;
      venueRegion?: string | null;
      eventNotes?: string | null;
      sourceUrl?: string | null;
      brand?: string | null;
    },
  ) =>
    request<{ festival: { id: string; name: string; slug: string; year: number | null } }>(
      `/festivals/${slug}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteFestival: (slug: string) =>
    request<void>(`/festivals/${slug}`, { method: "DELETE" }),
  patchFestivalAttendance: (
    slug: string,
    body: { status: AttendanceStatus },
  ) =>
    request<{ ok: true; days: number }>(`/festivals/${slug}/attendance`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  putFestivalSets: (
    slug: string,
    sets: Array<{
      artistId?: string;
      artistName?: string;
      performanceDate?: string | null;
      stageName?: string | null;
      setOrder?: number | null;
      appearanceNotes?: string | null;
    }>,
  ) =>
    request<{ ok: true; count: number; days: number }>(`/festivals/${slug}/sets`, {
      method: "PUT",
      body: JSON.stringify({ sets }),
    }),
  uploadFestivalFlyer: (slug: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<{ flyerUrl: string }>(`/festivals/${slug}/flyer`, {
      method: "POST",
      body: form,
      rawBody: true,
    });
  },
  uploadFestivalFlyerFromUrl: (slug: string, url: string) =>
    request<{ flyerUrl: string }>(`/festivals/${slug}/flyer/url`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  deleteFestivalFlyer: (slug: string) =>
    request<void>(`/festivals/${slug}/flyer`, { method: "DELETE" }),

  // Flyer
  uploadFlyer: (concertId: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<{ flyerUrl: string }>(`/concerts/${concertId}/flyer`, {
      method: "POST",
      body: form,
      rawBody: true,
    });
  },
  deleteFlyer: (concertId: string) =>
    request<void>(`/concerts/${concertId}/flyer`, { method: "DELETE" }),

  uploadFlyerFromUrl: (concertId: string, url: string) =>
    request<{ flyerUrl: string }>(`/concerts/${concertId}/flyer/url`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  // Venue photo
  uploadVenuePhoto: (venueSlug: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<{ imageUrl: string }>(`/venues/${venueSlug}/photo`, {
      method: "POST",
      body: form,
      rawBody: true,
    });
  },
  uploadVenuePhotoFromUrl: (venueSlug: string, url: string) =>
    request<{ imageUrl: string }>(`/venues/${venueSlug}/photo/url`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  deleteVenuePhoto: (venueSlug: string) =>
    request<void>(`/venues/${venueSlug}/photo`, { method: "DELETE" }),

  // Setlist.fm
  searchSetlistfm: (params: { artist: string; date: string }) => {
    const qs = new URLSearchParams({ artist: params.artist, date: params.date });
    return request<SetlistfmSearchResponse>(`/setlistfm/search?${qs.toString()}`);
  },
  searchSetlistfmArtist: (mbidOrName: string, page?: number) => {
    const qs = new URLSearchParams();
    if (page && page > 1) qs.set("page", String(page));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<SetlistfmSearchResponse>(`/setlistfm/artist/${encodeURIComponent(mbidOrName)}${query}`);
  },
  getSetlistfmById: (idOrUrl: string) => {
    // Parse ID from URL if it's a full setlist.fm URL
    let setlistId = idOrUrl;
    if (idOrUrl.includes("setlist.fm")) {
      const match = idOrUrl.match(/([a-z0-9]+)\.html$/i);
      if (match) {
        setlistId = match[1]!;
      } else {
        return Promise.reject(new ApiError("Could not parse setlist ID from URL", 400));
      }
    }
    return request<SetlistfmByIdResponse>(`/setlistfm/setlist/${encodeURIComponent(setlistId)}`);
  },
  parseSetlistfmId: (url: string): string | null => {
    const match = url.match(/([a-z0-9]+)\.html$/i);
    return match ? match[1]! : null;
  },
  saveSetlistLink: (concertId: string, artistId: string, setlistfmId: string) =>
    request<{ ok: true; setlistId: string | null }>(`/concerts/${concertId}/setlists/${artistId}`, {
      method: "PUT",
      body: JSON.stringify({ setlistfmId }),
    }),
  deleteSetlistLink: (concertId: string, artistId: string) =>
    request<void>(`/concerts/${concertId}/setlists/${artistId}`, { method: "DELETE" }),
  getArtistSetlists: (slug: string) =>
    request<ArtistSetlistsResponse>(`/artists/${slug}/setlists`),

  // Admin
  uploadCsvImport: (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<{ importId: string }>("/admin/imports", {
      method: "POST",
      body: form,
      rawBody: true,
    });
  },
  listImports: () => request<{ imports: ImportRow[] }>("/admin/imports"),
  getImport: (id: string) => request<ImportRow>(`/admin/imports/${id}`),
};

export interface ImportRow {
  id: string;
  userId: string;
  objectKey: string;
  originalFilename: string | null;
  status: "queued" | "running" | "completed" | "failed";
  totalRows: number;
  processedRows: number;
  errorCount: number;
  errorsSample: Array<{ row: number; message: string }> | null;
  summary: Record<string, number> | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

// ─── Concert types ────────────────────────────────────────────────────────────

export interface ConcertArtist {
  id: string;
  name: string;
  slug: string;
  role: string;
  setOrder: number | null;
  appearanceNotes: string | null;
}

export interface ConcertVenue {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ConcertSeries {
  id: string;
  slug: string;
  name: string;
  year: number | null;
}

export interface ConcertAttendance {
  status: AttendanceStatus;
  personalNotes: string | null;
  ticketPricePaid: number | null;
  ticketPriceCurrency: string | null;
  attendedConfirmedAt: string | null;
}

export interface ConcertListItem {
  id: string;
  /** Readable URL key, e.g. "foo-fighters-2011-09-10" — use with /shows/:slug. */
  slug: string;
  date: string;
  type: "concert" | "festival_day";
  dateIsApproximate: boolean;
  headlinerHint: string | null;
  flyerUrl: string | null;
  flyerInherited?: boolean;
  venue: ConcertVenue | null;
  eventSeries: ConcertSeries | null;
  attendance?: ConcertAttendance;  // Optional for public endpoints
  artists: ConcertArtist[];
  /** Festival days only: which day of the festival this is. */
  festivalDay?: { number: number; count: number } | null;
}

export interface ConcertDetail extends ConcertListItem {
  /** The show's status for everyone (the viewer's own if signed in), or null if never logged. */
  status: AttendanceStatus | null;
  flyerUrl: string | null;
  flyerHash: string | null;
  flyerInherited: boolean;
  eventNotes: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConcertSetlistEntry {
  id: string;
  /** Bare setlist.fm id (older rows may still hold a full URL). */
  setlistfmId: string | null;
  /** Songs cached from setlist.fm, grouped by set/encore; empty until fetched. */
  sets: SetlistfmSet[];
}

export interface ConcertDetailResponse {
  concert: ConcertDetail;
  setlists: Record<string, ConcertSetlistEntry>;
  /** Every day of the festival this show belongs to (festival days only). */
  /** Every logged day of this show's festival; `number` counts from the festival's start date. */
  festivalDays?: Array<{ number: number; date: string; concertId: string; slug: string; lineup: string[] }>;
  /** How many days the festival runs (from its dates). */
  festivalLength?: number | null;
}

/** Full bill and festival-day position for naming a show (see lib/showTitle). */
export interface ShowInfo {
  type: "concert" | "festival_day";
  lineup: string[];
  seriesName: string | null;
  seriesSlug: string | null;
  dayNumber: number | null;
  dayCount: number | null;
}

export interface ConcertListResponse {
  concerts: ConcertListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface ConcertStatsResponse {
  stats: Partial<Record<AttendanceStatus, number>>;
  total: number;
}

// ─── Photo types ──────────────────────────────────────────────────────────────

export interface PhotoItem {
  id: string;
  kind: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  takenAt: string | null;
  processing: boolean;
  setOrder: number | null;
  contentHash: string | null;
  urls: {
    original: string;
    thumb: string | null;
    medium: string | null;
    large: string | null;
    video: string | null;
  };
  createdAt: string;
}

export interface PhotoArtistTag {
  id: string;
  name: string;
  slug: string;
  imageKey: string | null;
  imageUrl: string | null;
}

export interface ArtistPhoto {
  id: string;
  kind: string;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  urls: {
    original: string;
    thumb: string | null;
    medium: string | null;
    large: string | null;
  };
  concert: {
    id: string;
    date: string;
    venue: { name: string; city: string | null; region: string | null } | null;
  };
}

export interface ArtistPhotosResponse {
  artist: { id: string; name: string; slug: string };
  photos: ArtistPhoto[];
  total: number;
}

// ─── Artist types ─────────────────────────────────────────────────────────────

export interface ArtistListItem {
  id: string;
  name: string;
  slug: string;
  genre: string | null;
  /** Storage key; use imageUrl to show the photo. */
  imageKey: string | null;
  imageUrl: string | null;
  showCount: number;
}

export interface ArtistListResponse {
  artists: ArtistListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface ArtistDetailResponse {
  artist: {
    id: string;
    name: string;
    slug: string;
    mbid: string | null;
    genre: string | null;
    bio: string | null;
    imageKey: string | null;
    imageUrl: string | null;
  };
  concerts: Array<{
    id: string;
    slug: string;
    date: string;
    type: string;
    role: string;
    appearanceNotes: string | null;
    venue: { name: string; city: string | null; region: string | null } | null;
    eventSeries: { name: string; slug: string | null } | null;
    attendance?: { status: AttendanceStatus };
  }>;
  stats: {
    total: number;
    attended: number;
    firstSeen: string | null;
    lastSeen: string | null;
    /** Longest stretch between two attended shows. */
    longestGap: { days: number; from: string; to: string } | null;
    /** Songs heard live most often (distinct shows), from setlists of attended shows. */
    topSongs: { song: string; times: number; last: string }[];
    upcomingShow: {
      date: string;
      venue: { name: string; city: string | null; region: string | null } | null;
      eventSeries: { name: string; slug: string | null } | null;
      status: AttendanceStatus | undefined;
    } | null;
  };
}

export interface ArtistEnrichmentResponse {
  ok: boolean;
  updated: string[];
  fetched: {
    bio?: string;
    genre?: string;
    mbid?: string;
    imageUrl?: string;
    listeners?: number;
    playcount?: number;
  };
}

// ─── Venue types ──────────────────────────────────────────────────────────────

export interface VenueListItem {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  region: string | null;
  imageUrl: string | null;
  showCount: number;
}

export interface VenueListResponse {
  venues: VenueListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface VenueMapItem {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  region: string | null;
  lat: number;
  lng: number;
  showCount: number;
}

export interface VenueMapResponse {
  venues: VenueMapItem[];
  total: number;
}

export interface VenueAlias {
  id: string;
  name: string;
  slug: string;
  activeFrom: string | null;
  activeUntil: string | null;
  notes: string | null;
}

export interface VenueDetailResponse {
  /** Every artist seen here (attended shows), most often first. */
  artistsSeen: { name: string; slug: string; imageUrl: string | null; times: number; last: string }[];
  venue: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    region: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
    capacity: number | null;
    imageUrl: string | null;
    aliases: VenueAlias[];
  };
  concerts: Array<{
    id: string;
    date: string;
    type: string;
    slug: string;
    headlinerHint: string | null;
    headlinerName: string | null;
    headlinerSlug: string | null;
    info?: ShowInfo | null;
    eventSeries: { name: string } | null;
    attendance?: { status: AttendanceStatus };
  }>;
  stats: {
    total: number;
    uniqueArtists: number;
    firstVisit: string | null;
    lastVisit: string | null;
  };
}

export type ExportFormat = "csv" | "json" | "md";

// ─── Admin data cleanup ───────────────────────────────────────────────────────

export type DataEntityType = "venue" | "artist";

export interface DupRecord {
  id: string;
  name: string;
  slug: string;
  /** City for venues, first genre for artists. */
  sub: string | null;
  showCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface DupGroup {
  reason: "same-name" | "same-core" | "similar-spelling";
  records: DupRecord[];
}

export interface MergePreview {
  keep: { id: string; name: string };
  remove: { id: string; name: string };
  moves: { label: string; count: number }[];
  fills: string[];
}

/** Automatic setlist finder progress, counted per artist on attended past shows. */
export interface SetlistFinderStatus {
  available: boolean;
  /** setlist.fm calls the finder has made today (UTC) and its daily cap. */
  callsToday: number;
  dailyBudget: number;
  foundAutomatically: number;
  notOnSetlistfm: number;
  stillToCheck: number;
  withSetlist: number;
  total: number;
}

export interface MergeLogEntry {
  id: string;
  entityType: DataEntityType;
  keptId: string;
  keptName: string;
  removedName: string;
  createdAt: string;
  undoneAt: string | null;
  canUndo: boolean;
}

export interface HealthCheck {
  id: string;
  title: string;
  description: string;
  items: { id: string; label: string; sub?: string | null; href?: string }[];
  fix?: { label: string; confirm: string };
  cityGroups?: { spellings: { city: string; venues: number }[] }[];
}

// ─── URL parser types ─────────────────────────────────────────────────────────

export interface ParsedEvent {
  eventName:  string | null;
  date:       string | null;
  venueName:  string | null;
  venueCity:  string | null;
  artists:    string[];
  sourceUrl:  string;
  confidence: "high" | "medium" | "low";
}

// ─── Series types ─────────────────────────────────────────────────────────────


// ─── Festival types (first-class entities) ────────────────────────────────────

export interface FestivalVenue {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  region: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** A festival's attendance, summarised from its days (attended if any day was). */
export interface FestivalAttendance {
  status: AttendanceStatus;
  daysAttended: number;
  totalDays: number;
}

export interface FestivalListItem {
  id: string;
  name: string;
  slug: string;
  year: number | null;
  startDate: string | null;
  endDate: string | null;
  flyerUrl: string | null;
  venue: FestivalVenue | null;
  artistCount: number;
  dayCount: number;
  attendance: FestivalAttendance | null;
}

export interface FestivalListResponse {
  festivals: FestivalListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface FestivalSetArtist {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
}

export interface FestivalSet {
  id: string;
  /** The day show this set belongs to. */
  concertId: string;
  performanceDate: string | null;
  stageName: string | null;
  setOrder: number | null;
  appearanceNotes: string | null;
  artist: FestivalSetArtist;
}

export interface FestivalDetail {
  id: string;
  name: string;
  slug: string;
  year: number | null;
  /** The festival across years, e.g. "Bluesfest". */
  brand: string | null;
  startDate: string | null;
  endDate: string | null;
  flyerUrl: string | null;
  flyerHash: string | null;
  eventNotes: string | null;
  sourceUrl: string | null;
  venue: FestivalVenue | null;
  createdAt: string;
  updatedAt: string;
}

export interface FestivalDetailResponse {
  festival: FestivalDetail;
  sets: FestivalSet[];
  setsByDate: Record<string, FestivalSet[]>;
  /** Every day of the festival, in date order — the day's show and your attendance. */
  concertsByDate: Record<string, { id: string; slug: string; status: AttendanceStatus | null; number: number }>;
  attendance: FestivalAttendance | null;
  /** The same festival (brand) in other years, newest first. */
  otherYears: { name: string; slug: string; year: number | null; startDate: string | null; flyerUrl: string | null }[];
  stats: {
    totalArtists: number;
    /** How many days the festival runs, from its dates. */
    totalDays: number;
    /** How many of those days are logged as shows. */
    loggedDays: number;
  };
}

// ─── Setlist.fm types ─────────────────────────────────────────────────────────

export interface SetlistfmSet {
  name: string | null;
  encore: number | null;
  songs: string[];
}

export interface SetlistfmResult {
  id: string;
  artist: string;
  artistMbid: string | null;
  venue: string;
  city: string;
  country: string;
  date: string; // ISO YYYY-MM-DD
  sets: SetlistfmSet[];
}

export type SetlistfmError =
  | "auth_error"
  | "rate_limited"
  | "upstream_error"
  | "network_error"
  | "parse_error";

export interface SetlistfmSearchResponse {
  results: SetlistfmResult[];
  total: number;
  available: boolean; // false when SETLISTFM_API_KEY is not configured
  error: SetlistfmError | null;
}

export interface SetlistfmByIdResponse {
  result: SetlistfmResult | null;
  available: boolean;
  error: SetlistfmError | null;
}

// ─── Artist Setlist types ─────────────────────────────────────────────────────

export interface ArtistSetlistSong {
  position: number;
  name: string;
  isCover: boolean;
}

export interface ArtistSetlist {
  id: string;
  setlistfmId: string | null;
  concertId: string;
  concertDate: string;
  venue: { name: string; city: string | null } | null;
  songs: ArtistSetlistSong[];
}

export interface ArtistSetlistsResponse {
  artist: { id: string; name: string; slug: string; mbid: string | null };
  setlists: ArtistSetlist[];
  total: number;
}

// ─── Public types (no auth) ───────────────────────────────────────────────────

export interface PublicAttendance {
  status: AttendanceStatus;
  personalNotes: string | null;
  ticketPricePaid: number | null;
  ticketPriceCurrency: string | null;
}

export interface PublicConcertItem {
  id: string;
  date: string;
  type: "concert" | "festival_day";
  dateIsApproximate: boolean;
  headlinerHint: string | null;
  flyerUrl: string | null;
  venue: { id: string; slug: string; name: string; city: string | null; region: string | null } | null;
  artists: Array<{ id: string; name: string; slug: string; role: string; setOrder: number | null; appearanceNotes: string | null }>;
  attendance: PublicAttendance | null;
}

export interface PublicConcertListResponse {
  concerts: PublicConcertItem[];
  total: number;
}

export interface PublicConcertDetail extends PublicConcertItem {
  eventNotes: string | null;
  sourceUrl: string | null;
  eventSeries: { id: string; slug: string; name: string; year: number | null } | null;
  venue: { id: string; slug: string; name: string; city: string | null; region: string | null; lat: number | null; lng: number | null } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Year in review ──────────────────────────────────────────────────────────

export interface YearCount {
  year: number;
  count: number;
}

export interface YearReviewResponse {
  year: number;
  /** Every year with attended shows, newest first — drives year navigation. */
  years: YearCount[];
  totalShows: number;
  /** Attended shows the year before, or null if there were none. */
  prevYearShows: number | null;
  uniqueArtists: number;
  newArtistCount: number;
  uniqueVenues: number;
  newVenueCount: number;
  uniqueCities: number;
  songsHeard: number;
  photos: number;
  videos: number;
  shows: Array<{
    concertId: string;
    date: string;
    type: string;
    headliner: string | null;
    info: ShowInfo | null;
    flyerUrl: string | null;
    series: { name: string; slug: string } | null;
    venue: { name: string; city: string | null; slug: string } | null;
  }>;
  topArtists: Array<{ artistId: string; name: string; slug: string; count: number; isNew: boolean }>;
  newArtists: Array<{ artistId: string; name: string; slug: string; firstSeen: string }>;
  topVenues: Array<{ venueId: string; name: string; slug: string; city: string | null; count: number; isNew: boolean }>;
  festivals: Array<{ seriesId: string; name: string; slug: string; days: number; startDate: string }>;
  topSongs: Array<{ song: string; artistName: string | null; artistSlug: string | null; count: number }>;
}

// ─── Deep stats ──────────────────────────────────────────────────────────────

export interface DeepStatsResponse {
  totalShows: number;
  totalAttended: number;
  totalArtists: number;
  totalVenues: number;
  yearsActive: number;
  firstShow:  { concertId: string; date: string; headlinerHint: string | null; info: ShowInfo | null } | null;
  latestShow: { concertId: string; date: string; headlinerHint: string | null; info: ShowInfo | null } | null;

  byStatus:    Array<{ status: string; count: number }>;
  byYear:      Array<{ year: string; count: number; attended: number }>;
  byMonth:     Array<{ month: number; count: number }>;
  byDayOfWeek: Array<{ dow: number; count: number }>;
  heatmap:     Array<{ year: string; month: number; count: number }>;

  topArtists: Array<{
    artistId: string; name: string; slug: string;
    count: number;
    firstSeen: string; lastSeen: string;
  }>;
  topVenues: Array<{
    venueId: string; name: string; city: string | null; slug: string;
    count: number;
  }>;


  /** Attended shows within 3 days of today's date in earlier years; `daysOff` 0 = this very day. */
  onThisDay: Array<{
    concertId: string; slug: string; date: string; daysOff: number; flyerUrl: string | null; headlinerHint: string | null;
    seriesName: string | null; status: string; venueName: string | null; info: ShowInfo | null;
  }>;

  milestones: Array<{
    n: number; concertId: string; date: string; headlinerHint: string | null; seriesName: string | null; info: ShowInfo | null;
  }>;

  avgTicketCents: number | null;
  mostExpensiveShow: {
    concertId: string; date: string; headlinerHint: string | null;
    amountCents: number; currency: string;
  } | null;
}

// ─── CMS / Site copy ─────────────────────────────────────────────────────────

export interface CopyItem {
  key: string;
  value: string;
  description: string | null;
  section: string;
  updatedAt: string;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchIndex {
  artists: { name: string; slug: string; imageUrl: string | null; shows: number }[];
  venues: { name: string; slug: string; city: string | null; shows: number }[];
  festivals: { name: string; slug: string; year: number | null; startDate: string | null }[];
  shows: { slug: string; date: string; festival: string | null; venue: string | null; city: string | null; lineup: string | null }[];
  /** [song, artist, index into `shows`] */
  songs: [string, string | null, number][];
}

export interface TicketStub {
  id: string;
  width: number | null;
  height: number | null;
  urls: { original: string; thumb: string | null; medium: string | null; large: string | null };
  show: { id: string; slug: string; date: string; title: string | null; venue: string | null };
}

/** Which push notifications you get. */
export interface PushPrefs {
  /** Day of a show you're attending. */
  tonight: boolean;
  /** The morning after, if it's still marked attending. */
  howWasIt: boolean;
  /** "N years ago today" for shows you attended. */
  anniversaries: boolean;
}
