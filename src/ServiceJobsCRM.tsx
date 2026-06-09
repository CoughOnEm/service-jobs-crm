import { useState, useEffect, useMemo, useRef, useCallback, type CSSProperties } from "react";
import { supabase, IS_LOCAL, setRoom } from "./supabase";

/* ============================================================
   Types
   ============================================================ */
type Status = "pending" | "in_progress" | "completed" | "failed";
type PlatformId = "instagram" | "x" | "tiktok" | "whatsapp" | "telegram" | "facebook" | "youtube";

interface Job {
  id: string;
  room: string;
  client: string;
  platform: PlatformId;
  service: string;
  status: Status;
  price: string | null;
  cost: string | null;
  vendor: string | null;
  notes: string | null;
  images: string[];
  created_at: string;
  updated_at: string;
}

interface Vendor {
  id: string;
  room: string;
  name: string;
  services: string[];
  platforms: string[];
  contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/* ============================================================
   Constants + design tokens
   ============================================================ */
const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "x", label: "X", color: "#ffffff" },
  { id: "tiktok", label: "TikTok", color: "#fe2c55" },
  { id: "whatsapp", label: "WhatsApp", color: "#25D366" },
  { id: "telegram", label: "Telegram", color: "#26A5E4" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "youtube", label: "YouTube", color: "#FF0000" },
] as const;

const COLS = [
  { id: "pending", label: "Pending", color: "#f59e0b" },
  { id: "in_progress", label: "In Progress", color: "#3b82f6" },
  { id: "completed", label: "Completed", color: "#10b981" },
  { id: "failed", label: "Failed", color: "#ef4444" },
] as const;

const STATUS: Record<Status, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#f59e0b" },
  in_progress: { label: "In Progress", color: "#3b82f6" },
  completed: { label: "Completed", color: "#10b981" },
  failed: { label: "Failed", color: "#ef4444" },
};

const C = {
  bg: "#08080e",
  card: "#111119",
  card2: "#0e0e16",
  border: "#1a1a25",
  input: "#12121a",
  inputBorder: "#22222e",
  accent: "#6c5ce7",
  vendor: "#a78bfa",
  text: "#ddd",
  sub: "#666",
  faint: "#3a3a48",
  mono: "'JetBrains Mono', monospace",
};

/* ============================================================
   Helpers
   ============================================================ */
const toNum = (s?: string | null): number => {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const money = (n: number): string =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

async function compressImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const img = document.createElement("img");
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("img load failed"));
    img.src = url;
  });
  const maxW = 600;
  const scale = Math.min(1, maxW / (img.width || maxW));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((img.width || maxW) * scale);
  canvas.height = Math.round((img.height || maxW) * scale);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.6)
  );
}

async function uploadScreenshot(room: string, blob: Blob): Promise<string | null> {
  const path = `${room}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const up = await supabase.storage
    .from("screenshots")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (up.error) return null;
  // Bucket is private — return a long-lived signed URL. The URL is stored inside
  // the room-protected jobs row, so only someone with the password can reach it.
  const { data, error } = await supabase.storage
    .from("screenshots")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (error || !data) return null;
  return data.signedUrl;
}

/* ============================================================
   SVG brand logos (real vector paths)
   ============================================================ */
function PlatformLogo({ id, size = 16 }: { id: PlatformId; size?: number }) {
  switch (id) {
    case "instagram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Instagram">
          <defs>
            <radialGradient id="ig-grad" cx="30%" cy="107%" r="135%">
              <stop offset="0%" stopColor="#fdf497" />
              <stop offset="8%" stopColor="#fdf497" />
              <stop offset="45%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" />
              <stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)" />
          <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="3.4" fill="none" stroke="#fff" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.5" />
          <circle cx="16.4" cy="7.6" r="1.05" fill="#fff" />
        </svg>
      );
    case "x":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="X">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "tiktok": {
      const note =
        "M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.79a5.67 5.67 0 0 0-.78-.05 5.7 5.7 0 1 0 5.7 5.7V8.9a7.33 7.33 0 0 0 4.29 1.38V7.18a4.28 4.28 0 0 1-3.25-1.36z";
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-label="TikTok">
          <path d={note} transform="translate(-0.8,0.8)" fill="#25F4EE" />
          <path d={note} transform="translate(0.8,-0.8)" fill="#FE2C55" />
          <path d={note} fill="#f0f0f0" />
        </svg>
      );
    }
    case "whatsapp":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" aria-label="WhatsApp">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.16c-.25.69-1.45 1.32-1.99 1.36-.51.04-.99.23-3.35-.7-2.83-1.12-4.6-4.02-4.74-4.2-.14-.18-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.25-.28.55-.35.73-.35.18 0 .37 0 .53.01.17.01.4-.06.62.48.25.6.84 2.06.91 2.21.07.15.12.32.02.51-.09.18-.14.3-.28.46-.14.16-.3.36-.42.48-.14.14-.29.29-.12.57.16.28.73 1.2 1.57 1.95 1.08.96 1.99 1.26 2.27 1.4.28.14.45.12.61-.07.18-.21.7-.81.89-1.09.18-.28.37-.23.62-.14.25.09 1.6.76 1.88.9.28.14.46.21.53.32.07.12.07.66-.18 1.35z" />
        </svg>
      );
    case "telegram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Telegram">
          <circle cx="12" cy="12" r="10" fill="#26A5E4" />
          <path
            fill="#fff"
            d="M5.5 11.7c3.7-1.6 6.16-2.66 7.38-3.18 3.51-1.46 4.24-1.72 4.72-1.73.1 0 .34.02.49.15.13.1.16.25.18.35.02.1.04.33.02.51-.2 2.06-1.04 7.05-1.47 9.35-.18.97-.54 1.3-.88 1.33-.74.07-1.3-.49-2.02-.96-1.12-.74-1.76-1.2-2.85-1.92-1.26-.83-.44-1.28.28-2.02.19-.2 3.45-3.16 3.51-3.43.01-.03.01-.16-.06-.22-.07-.06-.18-.04-.25-.02-.11.02-1.8 1.14-5.1 3.36-.48.33-.92.49-1.32.48-.43-.01-1.27-.25-1.89-.45-.76-.25-1.36-.38-1.31-.8.03-.22.33-.45.91-.69z"
          />
        </svg>
      );
    case "facebook":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Facebook" fill="#1877F2">
          <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.48 0-1.94.93-1.94 1.88v2.26h3.3l-.53 3.49h-2.77V24C19.61 23.08 24 18.1 24 12.07z" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-label="YouTube">
          <path fill="#FF0000" d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14C4.5 20.45 12 20.45 12 20.45s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8z" />
          <path fill="#fff" d="M9.6 15.6 15.8 12 9.6 8.4z" />
        </svg>
      );
  }
}

function PlatformBadge({ id }: { id: PlatformId }) {
  const meta = PLATFORMS.find((p) => p.id === id);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px 3px 6px",
        borderRadius: 7,
        background: "#ffffff08",
        color: id === "x" ? "#e7e7ea" : meta?.color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <PlatformLogo id={id} size={14} />
      {meta?.label}
    </span>
  );
}

/* ============================================================
   Autocomplete text input (used for client / service / vendor)
   ============================================================ */
function AutoInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const v = value.toLowerCase();
  const matches = options
    .filter((o) => o && o.toLowerCase().includes(v) && o.toLowerCase() !== v)
    .slice(0, 6);
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.style.borderColor = C.accent;
        }}
        onBlur={(e) => {
          setOpen(false);
          e.currentTarget.style.borderColor = C.inputBorder;
        }}
        placeholder={placeholder}
        style={fieldStyle}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            background: "#15151f",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 12px 30px #000a",
          }}
        >
          {matches.map((m) => (
            <div
              key={m}
              onMouseDown={() => onChange(m)}
              style={{ padding: "9px 12px", fontSize: 13, color: "#cfcfe0", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1d1d2a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Shared styles
   ============================================================ */
const fieldStyle: CSSProperties = {
  width: "100%",
  background: C.input,
  border: `1px solid ${C.inputBorder}`,
  borderRadius: 10,
  padding: "11px 13px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  fontFamily: "Outfit, sans-serif",
  transition: "border-color .15s",
};
const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.sub,
  textTransform: "uppercase",
  letterSpacing: ".5px",
  marginBottom: 7,
  display: "block",
};
const primaryBtn: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 10,
  border: "none",
  background: C.accent,
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "Outfit, sans-serif",
};
const ghostBtn: CSSProperties = {
  padding: "9px 14px",
  borderRadius: 9,
  border: `1px solid ${C.border}`,
  background: "transparent",
  color: "#aaa",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "Outfit, sans-serif",
};

/* ============================================================
   Job card
   ============================================================ */
function JobCard({
  job,
  vendors,
  onEdit,
  onAdvance,
  onDelete,
  onImage,
  onDragStart,
  onDragEnd,
  draggable,
}: {
  job: Job;
  vendors: Vendor[];
  onEdit: (j: Job) => void;
  onAdvance: (j: Job) => void;
  onDelete: (j: Job) => void;
  onImage: (url: string) => void;
  onDragStart?: (j: Job) => void;
  onDragEnd?: () => void;
  draggable?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const profit = toNum(job.price) - toNum(job.cost);
  const hasMoney = !!job.price || !!job.cost;
  const notes = job.notes ?? "";
  const isVendor = !!job.vendor && vendors.some((v) => v.name === job.vendor);

  return (
    <div
      draggable={draggable}
      onDragStart={() => onDragStart?.(job)}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => onEdit(job)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.card,
        border: `1px solid ${hover ? "#26263a" : C.border}`,
        borderRadius: 12,
        padding: 13,
        cursor: "pointer",
        position: "relative",
        transition: "border-color .15s, transform .1s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0" }}>{job.client}</div>
        <button
          title="Advance status"
          onClick={(e) => {
            e.stopPropagation();
            onAdvance(job);
          }}
          style={{
            border: "none",
            background: STATUS[job.status].color + "22",
            color: STATUS[job.status].color,
            borderRadius: 7,
            width: 24,
            height: 24,
            cursor: "pointer",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          ⟳
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
        <PlatformBadge id={job.platform} />
        <span
          style={{
            padding: "3px 9px",
            borderRadius: 7,
            background: "#ffffff06",
            color: "#777",
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {job.service}
        </span>
        {job.vendor && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 9px",
              borderRadius: 7,
              background: isVendor ? C.vendor + "1a" : "#ffffff06",
              color: isVendor ? C.vendor : "#777",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            ⟡ {job.vendor}
          </span>
        )}
      </div>

      {notes && (
        <div style={{ marginTop: 9, fontSize: 12, color: "#8a8a9a", lineHeight: 1.4 }}>
          {notes.length > 70 ? notes.slice(0, 70) + "…" : notes}
        </div>
      )}

      {job.images.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginTop: 9 }}>
          {job.images.slice(0, 3).map((url, i) => (
            <div
              key={url + i}
              onClick={(e) => {
                e.stopPropagation();
                onImage(url);
              }}
              style={{
                width: 38,
                height: 38,
                borderRadius: 7,
                backgroundImage: `url(${url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                border: `1px solid ${C.border}`,
                position: "relative",
              }}
            >
              {i === 2 && job.images.length > 3 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "#000a",
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  +{job.images.length - 3}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 11,
          paddingTop: 10,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          {job.price && (
            <span style={{ fontSize: 13, fontWeight: 700, color: "#e7e7ea", fontFamily: C.mono }}>
              {money(toNum(job.price))}
            </span>
          )}
          {hasMoney && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: profit >= 0 ? "#10b981" : "#ef4444",
                fontFamily: C.mono,
              }}
            >
              {profit >= 0 ? "+" : ""}
              {money(profit)}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: C.faint }}>
          {new Date(job.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>

      {hover && (
        <button
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(job);
          }}
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "none",
            background: "#ef4444",
            color: "#fff",
            fontSize: 12,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Job form (slide-out)
   ============================================================ */
function JobForm({
  room,
  initial,
  services,
  clients,
  vendorNames,
  onClose,
  onSaved,
  notify,
}: {
  room: string;
  initial: Job | null;
  services: string[];
  clients: string[];
  vendorNames: string[];
  onClose: () => void;
  onSaved: () => void;
  notify: (m: string) => void;
}) {
  const [client, setClient] = useState(initial?.client ?? "");
  const [platform, setPlatform] = useState<PlatformId>(initial?.platform ?? "instagram");
  const [service, setService] = useState(initial?.service ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [cost, setCost] = useState(initial?.cost ?? "");
  const [status, setStatus] = useState<Status>(initial?.status ?? "pending");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!arr.length) return;
      setUploading(true);
      let current = images.length;
      for (const f of arr) {
        if (current >= 6) {
          notify("Max 6 screenshots");
          break;
        }
        try {
          const blob = await compressImage(f);
          const url = await uploadScreenshot(room, blob);
          if (url) {
            setImages((prev) => [...prev, url]);
            current++;
          } else {
            notify("Upload failed — is the 'screenshots' bucket set up?");
          }
        } catch {
          notify("Could not process an image");
        }
      }
      setUploading(false);
    },
    [images.length, room, notify]
  );

  // Clipboard paste anywhere in the form
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const profit = toNum(price) - toNum(cost);
  const showProfit = price.trim() !== "" && cost.trim() !== "";

  const save = async () => {
    if (!client.trim() || !service.trim()) {
      notify("Client and service are required");
      return;
    }
    setSaving(true);
    const payload = {
      client: client.trim(),
      platform,
      service: service.trim(),
      vendor: vendor.trim() || null,
      price: price.trim() || null,
      cost: cost.trim() || null,
      status,
      notes: notes.trim() || null,
      images,
    };
    let error;
    if (initial) {
      ({ error } = await supabase.from("jobs").update(payload).eq("id", initial.id).eq("room", room));
    } else {
      ({ error } = await supabase.from("jobs").insert({ room, ...payload }));
    }
    setSaving(false);
    if (error) {
      notify("Save failed: " + error.message);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Drawer title={initial ? "Edit Job" : "New Job"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>Client</label>
          <AutoInput value={client} onChange={setClient} options={clients} placeholder="Client name" />
        </div>

        <div>
          <label style={labelStyle}>Platform</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PLATFORMS.map((p) => {
              const sel = platform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  title={p.label}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 11,
                    background: sel ? p.color + "1a" : C.input,
                    border: `1.5px solid ${sel ? p.color : C.inputBorder}`,
                    boxShadow: sel ? `0 0 12px ${p.color}55` : "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#e7e7ea",
                    transition: "all .15s",
                  }}
                >
                  <PlatformLogo id={p.id} size={22} />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Service</label>
          <AutoInput
            value={service}
            onChange={setService}
            options={services}
            placeholder="Type any service — new ones are saved automatically"
          />
        </div>

        <div>
          <label style={labelStyle}>Vendor</label>
          <AutoInput value={vendor} onChange={setVendor} options={vendorNames} placeholder="Vendor (optional)" />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Client Pays</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={fieldStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Vendor Cost</label>
            <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" style={fieldStyle} />
          </div>
        </div>

        {showProfit && (
          <div
            style={{
              background: profit >= 0 ? "#10b98115" : "#ef444415",
              border: `1px solid ${profit >= 0 ? "#10b98144" : "#ef444444"}`,
              borderRadius: 10,
              padding: "11px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#aaa" }}>Profit</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: profit >= 0 ? "#10b981" : "#ef4444", fontFamily: C.mono }}>
              {profit >= 0 ? "+" : ""}
              {money(profit)}
            </span>
          </div>
        )}

        <div>
          <label style={labelStyle}>Status</label>
          <div style={{ display: "flex", gap: 7 }}>
            {(Object.keys(STATUS) as Status[]).map((s) => {
              const sel = status === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  style={{
                    flex: 1,
                    padding: "9px 4px",
                    borderRadius: 9,
                    background: sel ? STATUS[s].color + "22" : C.input,
                    border: `1px solid ${sel ? STATUS[s].color : C.inputBorder}`,
                    color: sel ? STATUS[s].color : "#888",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {STATUS[s].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Screenshots ({images.length}/6)</label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropping(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `1.5px dashed ${dropping ? C.accent : C.inputBorder}`,
              background: dropping ? C.accent + "11" : C.input,
              borderRadius: 11,
              padding: 14,
              cursor: "pointer",
              textAlign: "center",
              fontSize: 12,
              color: C.sub,
            }}
          >
            {uploading ? "Uploading…" : "Click, paste, or drop images (auto-compressed)"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>
          {images.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {images.map((url, i) => (
                <div key={url + i} style={{ position: "relative" }}>
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 9,
                      backgroundImage: `url(${url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      border: `1px solid ${C.border}`,
                    }}
                  />
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "none",
                      background: "#ef4444",
                      color: "#fff",
                      fontSize: 11,
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Create Job"}
          </button>
          <button onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
        </div>
      </div>
    </Drawer>
  );
}

/* ============================================================
   Vendor form (slide-out)
   ============================================================ */
function VendorForm({
  room,
  initial,
  services,
  onClose,
  onSaved,
  notify,
}: {
  room: string;
  initial: Vendor | null;
  services: string[];
  onClose: () => void;
  onSaved: () => void;
  notify: (m: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [svcs, setSvcs] = useState<string[]>(initial?.services ?? []);
  const [plats, setPlats] = useState<string[]>(initial?.platforms ?? []);
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [newSvc, setNewSvc] = useState("");
  const [saving, setSaving] = useState(false);

  const allSvcOptions = useMemo(
    () => [...new Set([...services, ...svcs])].sort(),
    [services, svcs]
  );

  const toggleSvc = (s: string) =>
    setSvcs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const addNewSvc = () => {
    const s = newSvc.trim();
    if (s && !svcs.includes(s)) setSvcs((prev) => [...prev, s]);
    setNewSvc("");
  };
  const togglePlat = (p: string) =>
    setPlats((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const save = async () => {
    if (!name.trim()) {
      notify("Vendor name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      services: svcs,
      platforms: plats,
      contact: contact.trim() || null,
      notes: notes.trim() || null,
    };
    let error;
    if (initial) {
      ({ error } = await supabase.from("vendors").update(payload).eq("id", initial.id).eq("room", room));
    } else {
      ({ error } = await supabase.from("vendors").insert({ room, ...payload }));
    }
    setSaving(false);
    if (error) {
      notify("Save failed: " + error.message);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Drawer title={initial ? "Edit Vendor" : "New Vendor"} onClose={onClose} accent={C.vendor}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" style={fieldStyle} />
        </div>

        <div>
          <label style={labelStyle}>Services Provided</label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 9 }}>
            {allSvcOptions.length === 0 && (
              <span style={{ fontSize: 12, color: C.faint }}>No services yet — add jobs or type one below.</span>
            )}
            {allSvcOptions.map((s) => {
              const sel = svcs.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSvc(s)}
                  style={{
                    padding: "6px 11px",
                    borderRadius: 8,
                    background: sel ? C.vendor + "22" : C.input,
                    border: `1px solid ${sel ? C.vendor : C.inputBorder}`,
                    color: sel ? C.vendor : "#999",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {sel ? "✓ " : ""}
                  {s}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newSvc}
              onChange={(e) => setNewSvc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNewSvc())}
              placeholder="Add a new service…"
              style={fieldStyle}
            />
            <button onClick={addNewSvc} style={ghostBtn}>
              Add
            </button>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Platforms</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PLATFORMS.map((p) => {
              const sel = plats.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlat(p.id)}
                  title={p.label}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 11,
                    background: sel ? p.color + "1a" : C.input,
                    border: `1.5px solid ${sel ? p.color : C.inputBorder}`,
                    boxShadow: sel ? `0 0 12px ${p.color}55` : "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PlatformLogo id={p.id} size={22} />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Contact</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="@handle, email, phone…"
            style={fieldStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Reliability, turnaround, pricing…"
            style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ ...primaryBtn, flex: 1, background: C.vendor, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Vendor"}
          </button>
          <button onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
        </div>
      </div>
    </Drawer>
  );
}

/* ============================================================
   Slide-out drawer shell
   ============================================================ */
function Drawer({
  title,
  onClose,
  accent = C.accent,
  children,
}: {
  title: string;
  onClose: () => void;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "#000a", backdropFilter: "blur(2px)" }} />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 100%)",
          background: C.card2,
          borderLeft: `1px solid ${C.border}`,
          padding: 24,
          overflowY: "auto",
          animation: "slideIn .2s ease",
        }}
      >
        <style>{`@keyframes slideIn{from{transform:translateX(30px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#f0f0f0" }}>
            <span style={{ color: accent }}>⬢</span> {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: "#888",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   Stats card
   ============================================================ */
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 92,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, color: C.sub, letterSpacing: "1px" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: color ?? "#f0f0f0", fontFamily: C.mono, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   Main component
   ============================================================ */
export default function ServiceJobsCRM({ room, onLock }: { room: string; onLock: () => void }) {
  // Scope the Supabase client to this room (adds the x-room header) before any query runs.
  useMemo(() => setRoom(room), [room]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [view, setView] = useState<"kanban" | "list" | "vendors">("kanban");
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformId | "all">("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  const [jobForm, setJobForm] = useState<{ open: boolean; job: Job | null }>({ open: false, job: null });
  const [vendorForm, setVendorForm] = useState<{ open: boolean; vendor: Vendor | null }>({ open: false, vendor: null });

  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(0);

  const notify = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  /* ---- data loading ---- */
  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: false });
    if (data) setJobs(data as Job[]);
  }, [room]);

  const loadVendors = useCallback(async () => {
    const { data } = await supabase
      .from("vendors")
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: false });
    if (data) setVendors(data as Vendor[]);
  }, [room]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadJobs(), loadVendors()]);
      if (alive) setLoading(false);
    })();

    // Locked-down RLS can't drive realtime (it needs the room header, which the
    // realtime socket doesn't send), so we poll every 5s for cross-device updates.
    const iv = window.setInterval(() => {
      loadJobs();
      loadVendors();
    }, 5000);

    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [room, loadJobs, loadVendors]);

  /* ---- derived ---- */
  // Master service list = services used on jobs PLUS services offered by vendors,
  // so adding services to a vendor grows the list everywhere (autocomplete, filter, toggles).
  const allServices = useMemo(
    () =>
      [
        ...new Set(
          [...jobs.map((j) => j.service), ...vendors.flatMap((v) => v.services)].filter(Boolean)
        ),
      ].sort(),
    [jobs, vendors]
  );
  const allClients = useMemo(
    () => [...new Set(jobs.map((j) => j.client).filter(Boolean))].sort(),
    [jobs]
  );
  const vendorNames = useMemo(
    () => [...new Set([...vendors.map((v) => v.name), ...jobs.map((j) => j.vendor ?? "")].filter(Boolean))].sort(),
    [vendors, jobs]
  );

  const platformCounts = useMemo(() => {
    const m: Record<string, number> = {};
    jobs.forEach((j) => (m[j.platform] = (m[j.platform] ?? 0) + 1));
    return m;
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (platformFilter !== "all" && j.platform !== platformFilter) return false;
      if (serviceFilter !== "all" && j.service !== serviceFilter) return false;
      if (q) {
        const hay = `${j.client} ${j.notes ?? ""} ${j.vendor ?? ""} ${j.service}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, search, platformFilter, serviceFilter]);

  const stats = useMemo(() => {
    const completed = jobs.filter((j) => j.status === "completed");
    const revenue = completed.reduce((s, j) => s + toNum(j.price), 0);
    const costs = completed.reduce((s, j) => s + toNum(j.cost), 0);
    return {
      total: jobs.length,
      queue: jobs.filter((j) => j.status === "pending").length,
      active: jobs.filter((j) => j.status === "in_progress").length,
      done: completed.length,
      revenue,
      costs,
      profit: revenue - costs,
    };
  }, [jobs]);

  const filtersActive = search.trim() !== "" || platformFilter !== "all" || serviceFilter !== "all";

  /* ---- mutations ---- */
  const advance = async (job: Job) => {
    const order: Status[] = ["pending", "in_progress", "completed", "failed"];
    const next = order[(order.indexOf(job.status) + 1) % order.length];
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: next } : j)));
    await supabase.from("jobs").update({ status: next }).eq("id", job.id).eq("room", room);
  };

  const move = async (job: Job, status: Status) => {
    if (job.status === status) return;
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status } : j)));
    await supabase.from("jobs").update({ status }).eq("id", job.id).eq("room", room);
  };

  const deleteJob = async (job: Job) => {
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    await supabase.from("jobs").delete().eq("id", job.id).eq("room", room);
    notify("Job deleted", async () => {
      await supabase.from("jobs").insert(job);
      await loadJobs();
    });
  };

  const deleteVendor = async (v: Vendor) => {
    setVendors((prev) => prev.filter((x) => x.id !== v.id));
    await supabase.from("vendors").delete().eq("id", v.id).eq("room", room);
    notify("Vendor deleted", async () => {
      await supabase.from("vendors").insert(v);
      await loadVendors();
    });
  };

  const handleDrop = (status: Status) => {
    if (!dragId) return;
    const job = jobs.find((j) => j.id === dragId);
    setDragId(null);
    if (job) move(job, status);
  };

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === "n" && !typing && !jobForm.open && !vendorForm.open) {
        e.preventDefault();
        setJobForm({ open: true, job: null });
      } else if (e.key === "Escape") {
        setJobForm({ open: false, job: null });
        setVendorForm({ open: false, vendor: null });
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jobForm.open, vendorForm.open]);

  /* ---- view chips ---- */
  const viewBtn = (id: typeof view, icon: string, label: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 13px",
    borderRadius: 9,
    border: `1px solid ${view === id ? C.accent : C.border}`,
    background: view === id ? C.accent + "1a" : "transparent",
    color: view === id ? "#fff" : "#888",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "Outfit, sans-serif",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      {/* ---------- Local-mode banner ---------- */}
      {IS_LOCAL && (
        <div
          style={{
            background: "#f59e0b18",
            borderBottom: "1px solid #f59e0b33",
            color: "#f4c87a",
            fontSize: 12,
            padding: "7px 22px",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9 }}>●</span>
          <span>
            <b>Local mode</b> — data is saved on this device only. Add a free Supabase URL + anon key to{" "}
            <code style={{ background: "#0008", padding: "1px 5px", borderRadius: 4 }}>.env</code> for live
            cross-device sync.
          </span>
        </div>
      )}

      {/* ---------- Header ---------- */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 22px",
          borderBottom: `1px solid ${C.border}`,
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          background: C.bg + "ee",
          backdropFilter: "blur(8px)",
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 22, color: C.accent }}>⬢</span>
          <span style={{ fontSize: 16, fontWeight: 900, color: "#f0f0f0", letterSpacing: "-.3px" }}>Service Jobs</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginLeft: 6 }}>
          <button style={viewBtn("kanban", "▦", "Board")} onClick={() => setView("kanban")}>
            ▦ Board
          </button>
          <button style={viewBtn("list", "≡", "List")} onClick={() => setView("list")}>
            ≡ List
          </button>
          <button style={viewBtn("vendors", "⟡", "Vendors")} onClick={() => setView("vendors")}>
            ⟡ Vendors
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {view === "vendors" ? (
          <button style={{ ...primaryBtn, background: C.vendor }} onClick={() => setVendorForm({ open: true, vendor: null })}>
            + New Vendor
          </button>
        ) : (
          <button style={primaryBtn} onClick={() => setJobForm({ open: true, job: null })}>
            + New Job
          </button>
        )}

        <button
          title="Lock board"
          onClick={onLock}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: "#888",
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          🔒
        </button>
      </header>

      {/* ---------- Stats ---------- */}
      <div style={{ display: "flex", gap: 10, padding: "18px 22px 4px", flexWrap: "wrap" }}>
        <Stat label="JOBS" value={String(stats.total)} />
        <Stat label="QUEUE" value={String(stats.queue)} color="#f59e0b" />
        <Stat label="ACTIVE" value={String(stats.active)} color="#3b82f6" />
        <Stat label="DONE" value={String(stats.done)} color="#10b981" />
        <Stat label="REVENUE" value={money(stats.revenue)} color="#e7e7ea" />
        <Stat label="COSTS" value={money(stats.costs)} color="#e7e7ea" />
        <Stat label="PROFIT" value={money(stats.profit)} color={stats.profit < 0 ? "#ef4444" : "#10b981"} />
      </div>

      {/* ---------- Filters ---------- */}
      {view !== "vendors" && (
        <div style={{ display: "flex", gap: 10, padding: "14px 22px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients, notes, vendors…   ( / )"
            style={{ ...fieldStyle, width: 280, flexShrink: 0 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setPlatformFilter("all")}
              style={{
                padding: "8px 12px",
                borderRadius: 9,
                border: `1px solid ${platformFilter === "all" ? C.accent : C.border}`,
                background: platformFilter === "all" ? C.accent + "1a" : "transparent",
                color: platformFilter === "all" ? "#fff" : "#888",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              All
            </button>
            {PLATFORMS.map((p) => {
              const sel = platformFilter === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatformFilter(sel ? "all" : p.id)}
                  title={p.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 11px",
                    borderRadius: 9,
                    border: `1px solid ${sel ? p.color : C.border}`,
                    background: sel ? p.color + "1a" : "transparent",
                    color: "#cfcfe0",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <PlatformLogo id={p.id} size={15} />
                  <span style={{ color: C.sub, fontFamily: C.mono, fontSize: 11 }}>{platformCounts[p.id] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={{
              ...fieldStyle,
              width: "auto",
              minWidth: 140,
              cursor: "pointer",
              appearance: "auto",
            }}
          >
            <option value="all">All services</option>
            {allServices.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {filtersActive && (
            <button
              onClick={() => {
                setSearch("");
                setPlatformFilter("all");
                setServiceFilter("all");
              }}
              style={ghostBtn}
            >
              Clear ✕
            </button>
          )}
        </div>
      )}

      {/* ---------- Body ---------- */}
      <main style={{ padding: "8px 22px 60px" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: C.sub }}>Loading board…</div>
        ) : view === "kanban" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
            {COLS.map((col) => {
              const colJobs = filtered.filter((j) => j.status === col.id);
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(col.id)}
                  style={{
                    background: "#0c0c14",
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: 12,
                    minHeight: 120,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "2px 4px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#e7e7ea" }}>{col.label}</span>
                    <span style={{ fontSize: 11, color: C.sub, fontFamily: C.mono }}>{colJobs.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {colJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        vendors={vendors}
                        draggable
                        onDragStart={(j) => setDragId(j.id)}
                        onDragEnd={() => setDragId(null)}
                        onEdit={(j) => setJobForm({ open: true, job: j })}
                        onAdvance={advance}
                        onDelete={deleteJob}
                        onImage={setLightbox}
                      />
                    ))}
                    {colJobs.length === 0 && (
                      <div style={{ fontSize: 11, color: C.faint, textAlign: "center", padding: "14px 0" }}>
                        Drop here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === "list" ? (
          <ListView
            jobs={filtered}
            vendors={vendors}
            onEdit={(j) => setJobForm({ open: true, job: j })}
            onAdvance={advance}
            onDelete={deleteJob}
            onImage={setLightbox}
          />
        ) : (
          <VendorGrid
            vendors={vendors}
            jobs={jobs}
            onEdit={(v) => setVendorForm({ open: true, vendor: v })}
            onDelete={deleteVendor}
            onAdd={() => setVendorForm({ open: true, vendor: null })}
          />
        )}

        {view !== "vendors" && !loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 50, color: C.sub }}>
            {jobs.length === 0 ? (
              <>
                No jobs yet. Press <b style={{ color: "#aaa" }}>N</b> or “New Job” to add one.
              </>
            ) : (
              "No jobs match your filters."
            )}
          </div>
        )}
      </main>

      {/* ---------- Forms ---------- */}
      {jobForm.open && (
        <JobForm
          room={room}
          initial={jobForm.job}
          services={allServices}
          clients={allClients}
          vendorNames={vendorNames}
          onClose={() => setJobForm({ open: false, job: null })}
          onSaved={loadJobs}
          notify={notify}
        />
      )}
      {vendorForm.open && (
        <VendorForm
          room={room}
          initial={vendorForm.vendor}
          services={allServices}
          onClose={() => setVendorForm({ open: false, vendor: null })}
          onSaved={loadVendors}
          notify={notify}
        />
      )}

      {/* ---------- Lightbox ---------- */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "#000d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 30,
            cursor: "zoom-out",
          }}
        >
          <img src={lightbox} style={{ maxWidth: "92%", maxHeight: "92%", borderRadius: 12, boxShadow: "0 20px 60px #000" }} />
        </div>
      )}

      {/* ---------- Toast ---------- */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 22,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 90,
            background: "#16161f",
            border: `1px solid ${C.border}`,
            borderRadius: 11,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            boxShadow: "0 12px 40px #000a",
          }}
        >
          <span style={{ fontSize: 13, color: "#e7e7ea" }}>{toast.msg}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: C.accent,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   List view
   ============================================================ */
function ListView({
  jobs,
  vendors,
  onEdit,
  onAdvance,
  onDelete,
  onImage,
}: {
  jobs: Job[];
  vendors: Vendor[];
  onEdit: (j: Job) => void;
  onAdvance: (j: Job) => void;
  onDelete: (j: Job) => void;
  onImage: (url: string) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {jobs.map((job) => {
        const profit = toNum(job.price) - toNum(job.cost);
        const hasMoney = !!job.price || !!job.cost;
        return (
          <div
            key={job.id}
            onClick={() => onEdit(job)}
            onMouseEnter={() => setHoverId(job.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: C.card,
              border: `1px solid ${hoverId === job.id ? "#26263a" : C.border}`,
              borderRadius: 11,
              padding: "11px 14px",
              cursor: "pointer",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdvance(job);
              }}
              title={STATUS[job.status].label}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "none",
                background: STATUS[job.status].color,
                cursor: "pointer",
                flexShrink: 0,
              }}
            />
            <div style={{ fontWeight: 700, color: "#f0f0f0", fontSize: 14, minWidth: 120 }}>{job.client}</div>
            <PlatformBadge id={job.platform} />
            <span style={{ padding: "3px 9px", borderRadius: 7, background: "#ffffff06", color: "#777", fontSize: 11 }}>
              {job.service}
            </span>
            {job.vendor && (
              <span style={{ fontSize: 11, color: C.vendor, fontWeight: 600 }}>⟡ {job.vendor}</span>
            )}
            <div style={{ flex: 1, fontSize: 12, color: "#8a8a9a", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {(job.notes ?? "").slice(0, 70)}
            </div>
            {job.images.length > 0 && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onImage(job.images[0]);
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  backgroundImage: `url(${job.images[0]})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: `1px solid ${C.border}`,
                  flexShrink: 0,
                }}
              />
            )}
            {job.price && (
              <span style={{ fontFamily: C.mono, fontWeight: 700, color: "#e7e7ea", fontSize: 13 }}>
                {money(toNum(job.price))}
              </span>
            )}
            {hasMoney && (
              <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: profit >= 0 ? "#10b981" : "#ef4444", minWidth: 56, textAlign: "right" }}>
                {profit >= 0 ? "+" : ""}
                {money(profit)}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(job);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: hoverId === job.id ? "#ef4444" : "transparent",
                cursor: "pointer",
                fontSize: 16,
                width: 22,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Vendor grid
   ============================================================ */
function VendorGrid({
  vendors,
  jobs,
  onEdit,
  onDelete,
  onAdd,
}: {
  vendors: Vendor[];
  jobs: Job[];
  onEdit: (v: Vendor) => void;
  onDelete: (v: Vendor) => void;
  onAdd: () => void;
}) {
  if (vendors.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 50, color: C.sub }}>
        No vendors yet.{" "}
        <button onClick={onAdd} style={{ ...ghostBtn, display: "inline-block", marginLeft: 6 }}>
          + Add vendor
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
      {vendors.map((v) => {
        const vJobs = jobs.filter((j) => j.vendor === v.name);
        const totalPaid = vJobs.reduce((s, j) => s + toNum(j.cost), 0);
        return (
          <div
            key={v.id}
            onClick={() => onEdit(v)}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: 16,
              cursor: "pointer",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.vendor, fontSize: 16 }}>⟡</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#f0f0f0" }}>{v.name}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(v);
                }}
                style={{ border: "none", background: "transparent", color: "#555", cursor: "pointer", fontSize: 16 }}
              >
                ×
              </button>
            </div>

            {v.platforms.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 11 }}>
                {v.platforms.map((p) => (
                  <PlatformLogo key={p} id={p as PlatformId} size={17} />
                ))}
              </div>
            )}

            {v.services.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
                {v.services.slice(0, 5).map((s) => (
                  <span key={s} style={{ padding: "3px 9px", borderRadius: 7, background: C.vendor + "14", color: C.vendor, fontSize: 11, fontWeight: 600 }}>
                    {s}
                  </span>
                ))}
                {v.services.length > 5 && (
                  <span style={{ fontSize: 11, color: C.sub }}>+{v.services.length - 5}</span>
                )}
              </div>
            )}

            {v.contact && <div style={{ marginTop: 11, fontSize: 12, color: "#8a8a9a" }}>{v.contact}</div>}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 13,
                paddingTop: 11,
                borderTop: `1px solid ${C.border}`,
              }}
            >
              <div>
                <div style={{ fontSize: 9, color: C.sub, fontWeight: 700, letterSpacing: "1px" }}>JOBS</div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: C.mono, color: "#e7e7ea" }}>{vJobs.length}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: C.sub, fontWeight: 700, letterSpacing: "1px" }}>TOTAL PAID</div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: C.mono, color: C.vendor }}>{money(totalPaid)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
