import type { UserPublic, AttendanceStatus } from "@tagg/shared";

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
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers,
    ...rest,
  });
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
    status?: AttendanceStatus;
    year?: number;
    q?: string;
    sort?: "date_desc" | "date_asc";
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
    return request<ConcertListResponse>(`/concerts${query}`);
  },
  concertStats: () => request<ConcertStatsResponse>("/concerts/stats"),
  listFollowup: () => request<{ concerts: ConcertListItem[]; total: number }>("/concerts/followup"),
  getConcert: (id: string) => request<{ concert: ConcertDetail }>(`/concerts/${id}`),
  patchConcert: (
    id: string,
    body: {
      // Attendance (per-user)
      status?: AttendanceStatus;
      rating?: number | null;
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
      rating?: number | null;
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
  getDeepStats: (localDate?: string) =>
    request<DeepStatsResponse>(
      `/concerts/deep-stats${localDate ? `?localDate=${encodeURIComponent(localDate)}` : ""}`,
    ),
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
    request<{ concertId: string }>("/concerts", { method: "POST", body: JSON.stringify(body) }),
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
  exportCsv: () =>
    fetch("/api/users/me/export.csv", { credentials: "include" }).then((r) => {
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

  // Venues
  listVenues: (params?: { q?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<VenueListResponse>(`/venues${query}`);
  },
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
  parseEventUrl: (url: string) =>
    request<ParsedEvent>("/concerts/parse-url", { method: "POST", body: JSON.stringify({ url }) }),

  // Series / festivals
  listSeries: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<SeriesListResponse>(`/series${query}`);
  },
  getSeries: (slug: string) => request<SeriesDetailResponse>(`/series/${slug}`),
  patchSeries: (slug: string, body: { name?: string; year?: number | null }) =>
    request<{ series: { id: string; name: string; slug: string; year: number | null } }>(
      `/series/${slug}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

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

  // Setlist.fm
  searchSetlistfm: (params: { artist: string; date: string }) => {
    const qs = new URLSearchParams({ artist: params.artist, date: params.date });
    return request<SetlistfmSearchResponse>(`/setlistfm/search?${qs.toString()}`);
  },

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
  rating: number | null;
  personalNotes: string | null;
  ticketPricePaid: number | null;
  ticketPriceCurrency: string | null;
  rsvpAt: string | null;
  attendedConfirmedAt: string | null;
}

export interface ConcertListItem {
  id: string;
  date: string;
  type: "concert" | "festival_day";
  dateIsApproximate: boolean;
  headlinerHint: string | null;
  flyerUrl: string | null;
  venue: ConcertVenue | null;
  eventSeries: ConcertSeries | null;
  attendance: ConcertAttendance;
  artists: ConcertArtist[];
}

export interface ConcertDetail extends ConcertListItem {
  flyerUrl: string | null;
  flyerHash: string | null;
  eventNotes: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
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
  imageKey: string | null;
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
    date: string;
    type: string;
    role: string;
    appearanceNotes: string | null;
    venue: { name: string; city: string | null; region: string | null } | null;
    eventSeries: { name: string } | null;
    attendance: { status: AttendanceStatus; rating: number | null };
  }>;
  stats: {
    total: number;
    attended: number;
    upcoming: number;
    firstSeen: string | null;
    lastSeen: string | null;
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

export interface VenueAlias {
  id: string;
  name: string;
  slug: string;
  activeFrom: string | null;
  activeUntil: string | null;
  notes: string | null;
}

export interface VenueDetailResponse {
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
    headlinerHint: string | null;
    headlinerName: string | null;
    headlinerSlug: string | null;
    eventSeries: { name: string } | null;
    attendance: { status: AttendanceStatus; rating: number | null };
  }>;
  stats: {
    total: number;
    attended: number;
    firstVisit: string | null;
    lastVisit: string | null;
  };
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

export interface SeriesListItem {
  id: string;
  name: string;
  slug: string;
  year: number | null;
  dayCount: number;
  artistCount: number;
}

export interface SeriesListResponse {
  series: SeriesListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface SeriesDetailResponse {
  series: {
    id: string;
    name: string;
    slug: string;
    year: number | null;
  };
  concerts: Array<{
    id: string;
    date: string;
    venue: { name: string; city: string | null } | null;
    attendance: { status: AttendanceStatus };
    artists: Array<{ name: string; slug: string }>;
  }>;
  stats: {
    daysAttended: number;
    uniqueArtists: number;
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

// ─── Public types (no auth) ───────────────────────────────────────────────────

export interface PublicAttendance {
  status: AttendanceStatus;
  rating: number | null;
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

// ─── Deep stats ──────────────────────────────────────────────────────────────

export interface DeepStatsResponse {
  totalShows: number;
  totalAttended: number;
  totalArtists: number;
  totalVenues: number;
  yearsActive: number;
  avgRating: number | null;
  firstShow:  { concertId: string; date: string; headlinerHint: string | null } | null;
  latestShow: { concertId: string; date: string; headlinerHint: string | null } | null;

  byStatus:    Array<{ status: string; count: number }>;
  byYear:      Array<{ year: string; count: number; attended: number; avgRating: number | null }>;
  byMonth:     Array<{ month: number; count: number }>;
  byDayOfWeek: Array<{ dow: number; count: number }>;
  heatmap:     Array<{ year: string; month: number; count: number }>;

  topArtists: Array<{
    artistId: string; name: string; slug: string;
    count: number; avgRating: number | null;
    firstSeen: string; lastSeen: string;
  }>;
  topVenues: Array<{
    venueId: string; name: string; city: string | null; slug: string;
    count: number; avgRating: number | null;
  }>;

  ratingDist: Array<{ rating: number; count: number }>;

  onThisDay: Array<{
    concertId: string; date: string; headlinerHint: string | null;
    seriesName: string | null; status: string; venueName: string | null;
  }>;

  milestones: Array<{
    n: number; concertId: string; date: string; headlinerHint: string | null; seriesName: string | null;
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
