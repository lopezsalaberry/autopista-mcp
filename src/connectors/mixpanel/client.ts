const QUERY_URLS: Record<string, string> = {
  us: "https://mixpanel.com/api/query",
  eu: "https://eu.mixpanel.com/api/query",
};

const EXPORT_URLS: Record<string, string> = {
  us: "https://data.mixpanel.com/api/2.0",
  eu: "https://data-eu.mixpanel.com/api/2.0",
};

interface MixpanelConfig {
  username: string;
  secret: string;
  projectId: string;
  region: string;
}

export class MixpanelClient {
  private queryUrl: string;
  private exportUrl: string;
  private authHeader: string;
  private projectId: string;

  constructor(cfg: MixpanelConfig) {
    this.queryUrl = QUERY_URLS[cfg.region] || QUERY_URLS.us;
    this.exportUrl = EXPORT_URLS[cfg.region] || EXPORT_URLS.us;
    this.projectId = cfg.projectId;
    this.authHeader =
      "Basic " + Buffer.from(`${cfg.username}:${cfg.secret}`).toString("base64");
  }

  private async queryGet(endpoint: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.queryUrl}/${endpoint}`);
    url.searchParams.set("project_id", this.projectId);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: this.authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mixpanel API ${res.status}: ${body}`);
    }
    return res.json();
  }

  private async queryPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.queryUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        project_id: this.projectId,
        ...Object.fromEntries(
          Object.entries(body)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
        ),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mixpanel API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async segmentation(params: {
    event: string;
    from_date: string;
    to_date: string;
    unit?: string;
    type?: string;
    on?: string;
    where?: string;
  }) {
    return this.queryGet("segmentation", {
      event: params.event,
      from_date: params.from_date,
      to_date: params.to_date,
      ...(params.unit && { unit: params.unit }),
      ...(params.type && { type: params.type }),
      ...(params.on && { on: params.on }),
      ...(params.where && { where: params.where }),
    });
  }

  async exportEvents(params: {
    from_date: string;
    to_date: string;
    event?: string[];
    where?: string;
    limit?: number;
  }) {
    const url = new URL(`${this.exportUrl}/export`);
    url.searchParams.set("project_id", this.projectId);
    url.searchParams.set("from_date", params.from_date);
    url.searchParams.set("to_date", params.to_date);
    if (params.event) url.searchParams.set("event", JSON.stringify(params.event));
    if (params.where) url.searchParams.set("where", params.where);
    if (params.limit) url.searchParams.set("limit", String(params.limit));

    const res = await fetch(url.toString(), {
      headers: { Authorization: this.authHeader, Accept: "text/plain" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mixpanel Export API ${res.status}: ${body}`);
    }

    const text = await res.text();
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  async profiles(params: {
    where?: string;
    output_properties?: string[];
    page_size?: number;
    session_id?: string;
    page?: number;
  }) {
    return this.queryPost("engage", {
      where: params.where,
      output_properties: params.output_properties,
      page_size: params.page_size,
      session_id: params.session_id,
      page: params.page,
    });
  }

  async funnels(params: {
    funnel_id: number;
    from_date: string;
    to_date: string;
    length?: number;
    unit?: string;
    on?: string;
    where?: string;
  }) {
    return this.queryGet("funnels", {
      funnel_id: String(params.funnel_id),
      from_date: params.from_date,
      to_date: params.to_date,
      ...(params.length && { length: String(params.length) }),
      ...(params.unit && { unit: params.unit }),
      ...(params.on && { on: params.on }),
      ...(params.where && { where: params.where }),
    });
  }

  async retention(params: {
    from_date: string;
    to_date: string;
    born_event?: string;
    event?: string;
    retention_type?: string;
    unit?: string;
  }) {
    return this.queryGet("retention", {
      from_date: params.from_date,
      to_date: params.to_date,
      ...(params.born_event && { born_event: params.born_event }),
      ...(params.event && { event: params.event }),
      ...(params.retention_type && { retention_type: params.retention_type }),
      ...(params.unit && { unit: params.unit }),
    });
  }

  async jql(script: string) {
    return this.queryPost("jql", { script });
  }
}
