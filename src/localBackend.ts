/* ============================================================
   Local-only fallback backend.

   Activates automatically when no Supabase keys are present, so the
   app runs for FREE with zero setup. Data lives in this browser
   (localStorage); screenshots are stored as data URLs; tabs on the
   same device stay in sync via BroadcastChannel.

   Add a free Supabase URL + anon key to .env to switch to real
   cross-device / multi-person realtime sync — no code changes needed.

   It mimics the small slice of the supabase-js API this app uses:
     from(table).select().eq().order()
     from(table).insert() / update().eq() / delete().eq()
     storage.from(bucket).upload() / getPublicUrl()
     channel().on().subscribe() / removeChannel()
   ============================================================ */

type Row = Record<string, unknown> & { id?: string; room?: string };

const KEY = (t: string) => "crm:" + t;
const IMG_KEY = "crm:img";

const bc: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("crm-sync") : null;

function load(table: string): Row[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(table)) || "[]") as Row[];
  } catch {
    return [];
  }
}
function persist(table: string, rows: Row[]): void {
  localStorage.setItem(KEY(table), JSON.stringify(rows));
  bc?.postMessage({ table });
}
function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function iso(): string {
  return new Date().toISOString();
}

interface Result {
  data: unknown;
  error: { message: string } | null;
}

class LocalQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<[string, unknown]> = [];
  private payload: unknown = null;
  private sort: { col: string; asc: boolean } | null = null;
  constructor(private table: string) {}

  select(_cols?: string): this {
    this.op = "select";
    return this;
  }
  insert(p: unknown): this {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: unknown): this {
    this.op = "update";
    this.payload = p;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.sort = { col, asc: opts?.ascending !== false };
    return this;
  }

  private match = (r: Row): boolean => this.filters.every(([c, v]) => r[c] === v);

  private run(): Result {
    let rows = load(this.table);

    if (this.op === "select") {
      let out = rows.filter(this.match);
      if (this.sort) {
        const { col, asc } = this.sort;
        out = [...out].sort((a, b) => {
          const av = a[col] as string;
          const bv = b[col] as string;
          return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      return { data: out, error: null };
    }

    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const ids = new Set(rows.map((r) => r.id));
      const stamped = items.map((it) => {
        const base: Row = {
          ...it,
          id: it.id ?? uuid(),
          created_at: it.created_at ?? iso(),
          updated_at: iso(),
        };
        if (this.table === "jobs" && base.images == null) base.images = [];
        return base;
      });
      for (const s of stamped) if (!ids.has(s.id)) rows.push(s);
      persist(this.table, rows);
      return { data: stamped, error: null };
    }

    if (this.op === "update") {
      const p = this.payload as Row;
      rows = rows.map((r) => (this.match(r) ? { ...r, ...p, updated_at: iso() } : r));
      persist(this.table, rows);
      return { data: null, error: null };
    }

    // delete
    rows = rows.filter((r) => !this.match(r));
    persist(this.table, rows);
    return { data: null, error: null };
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const res = this.run();
    return Promise.resolve(onfulfilled ? onfulfilled(res) : (res as unknown as TResult1));
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => resolve("");
    fr.readAsDataURL(blob);
  });
}

const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, blob: Blob): Promise<Result> {
        const dataUrl = await blobToDataURL(blob);
        let map: Record<string, string> = {};
        try {
          map = JSON.parse(localStorage.getItem(IMG_KEY) || "{}");
        } catch {
          map = {};
        }
        map[path] = dataUrl;
        try {
          localStorage.setItem(IMG_KEY, JSON.stringify(map));
        } catch {
          return { data: null, error: { message: "Local storage is full — remove some screenshots." } };
        }
        return { data: { path }, error: null };
      },
      getPublicUrl(path: string) {
        let map: Record<string, string> = {};
        try {
          map = JSON.parse(localStorage.getItem(IMG_KEY) || "{}");
        } catch {
          map = {};
        }
        return { data: { publicUrl: map[path] || "" } };
      },
    };
  },
};

interface LocalChannel {
  on(type: string, filter: unknown, cb: () => void): LocalChannel;
  subscribe(): LocalChannel;
  _listener?: (e: MessageEvent) => void;
}

function channel(_name: string): LocalChannel {
  const handlers: Array<() => void> = [];
  const ch: LocalChannel = {
    on(_type, _filter, cb) {
      handlers.push(cb);
      return ch;
    },
    subscribe() {
      const listener = () => handlers.forEach((h) => h());
      ch._listener = listener;
      bc?.addEventListener("message", listener);
      return ch;
    },
  };
  return ch;
}

function removeChannel(ch: LocalChannel): void {
  if (ch?._listener) bc?.removeEventListener("message", ch._listener);
}

export const localBackend = {
  from(table: string): LocalQuery {
    return new LocalQuery(table);
  },
  storage,
  channel,
  removeChannel,
};
