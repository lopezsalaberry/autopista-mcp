// Tool executor — dispatches Anthropic tool_use calls to actual APIs
// Reads credentials from process.env directly

import {
  projects,
  reportFormats,
  searchEvents,
  searchHubSpotOps,
} from "./knowledge-data";

const MAX_RESULT_LENGTH = 50_000;

function truncate(json: string): string {
  if (json.length <= MAX_RESULT_LENGTH) return json;
  return (
    json.slice(0, MAX_RESULT_LENGTH) +
    `\n\n... [TRUNCATED — result was ${json.length} chars, limit is ${MAX_RESULT_LENGTH}]`
  );
}

function stringify(data: unknown): string {
  return truncate(JSON.stringify(data, null, 2));
}

// ─── Mixpanel helpers ────────────────────────────────────────────

const MIXPANEL_QUERY_URLS: Record<string, string> = {
  us: "https://mixpanel.com/api/query",
  eu: "https://eu.mixpanel.com/api/query",
};

const MIXPANEL_EXPORT_URLS: Record<string, string> = {
  us: "https://data.mixpanel.com/api/2.0",
  eu: "https://data-eu.mixpanel.com/api/2.0",
};

function getMixpanelAuth(): string {
  const u = process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME || "";
  const s = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET || "";
  return "Basic " + Buffer.from(`${u}:${s}`).toString("base64");
}

function getMixpanelProjectId(): string {
  return process.env.MIXPANEL_PROJECT_ID || "";
}

function getMixpanelRegion(): string {
  return process.env.MIXPANEL_REGION || "us";
}

function mixpanelQueryUrl(): string {
  const region = getMixpanelRegion();
  return MIXPANEL_QUERY_URLS[region] || MIXPANEL_QUERY_URLS.us;
}

function mixpanelExportUrl(): string {
  const region = getMixpanelRegion();
  return MIXPANEL_EXPORT_URLS[region] || MIXPANEL_EXPORT_URLS.us;
}

async function mixpanelGet(
  endpoint: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${mixpanelQueryUrl()}/${endpoint}`);
  url.searchParams.set("project_id", getMixpanelProjectId());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: getMixpanelAuth(), Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mixpanel API ${res.status}: ${body}`);
  }
  return res.json();
}

async function mixpanelPost(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${mixpanelQueryUrl()}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: getMixpanelAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      project_id: getMixpanelProjectId(),
      ...Object.fromEntries(
        Object.entries(body)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
      ),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mixpanel API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── HubSpot helpers ─────────────────────────────────────────────

const HUBSPOT_BASE = "https://api.hubapi.com";

function hubspotHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function hubspotGet(path: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${HUBSPOT_BASE}${path}`;
  const res = await fetch(url, { headers: hubspotHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${body}`);
  }
  return res.json();
}

async function hubspotPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    method: "POST",
    headers: hubspotHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── HubSpot association helper (mirrors client.ts getAssociatedObjects) ───

async function getAssociatedObjects(
  sourceType: string,
  sourceId: string,
  targetType: string,
  properties: string[],
  limit: number = 100,
): Promise<{ results: any[]; total: number }> {
  const assocData = await hubspotGet(
    `/crm/v4/objects/${sourceType}/${sourceId}/associations/${targetType}`,
  );

  const ids: string[] = (assocData.results || []).map((r: any) =>
    String(r.toObjectId),
  );
  if (ids.length === 0) return { results: [], total: 0 };

  const batchData = await hubspotPost(
    `/crm/v3/objects/${targetType}/batch/read`,
    {
      inputs: ids.slice(0, limit).map((id) => ({ id })),
      properties,
    },
  );

  const results = (batchData.results || []).map((obj: any) => ({
    id: obj.id,
    properties: obj.properties,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  }));

  results.sort((a: any, b: any) => {
    const tsA = a.properties.hs_timestamp || a.createdAt || "";
    const tsB = b.properties.hs_timestamp || b.createdAt || "";
    return tsB.localeCompare(tsA);
  });

  return { results, total: ids.length };
}

// ─── HubSpot search helper ───────────────────────────────────────

interface SearchFilter {
  propertyName: string;
  operator: string;
  value: string;
}

async function hubspotSearch(
  objectType: string,
  options: {
    query?: string;
    filters?: SearchFilter[];
    properties?: string[];
    limit?: number;
    after?: string;
  },
) {
  const filterGroups = options.filters?.length
    ? [
        {
          filters: options.filters.map((f) => ({
            propertyName: f.propertyName,
            operator: f.operator,
            value: f.value,
          })),
        },
      ]
    : undefined;

  const body: any = {
    limit: options.limit || 10,
  };
  if (options.query) body.query = options.query;
  if (filterGroups) body.filterGroups = filterGroups;
  if (options.properties) body.properties = options.properties;
  if (options.after) body.after = String(options.after);

  const response = await hubspotPost(
    `/crm/v3/objects/${objectType}/search`,
    body,
  );

  return {
    total: response.total,
    results: (response.results || []).map((c: any) => ({
      id: c.id,
      properties: c.properties,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    paging: response.paging,
  };
}

// ─── Meta Ads helpers ────────────────────────────────────────────

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function getMetaAdAccountId(): string {
  const id = process.env.META_ADS_AD_ACCOUNT_ID || "";
  return id.startsWith("act_") ? id : `act_${id}`;
}

function getMetaAccessToken(): string {
  return process.env.META_ADS_ACCESS_TOKEN || "";
}

async function metaGet(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${META_BASE}${endpoint}`);
  url.searchParams.set("access_token", getMetaAccessToken());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta Ads API ${res.status}: ${body}`);
  }
  return res.json();
}

async function metaGetPaginated(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<unknown[]> {
  const results: unknown[] = [];

  const firstPage = (await metaGet(endpoint, {
    ...params,
    limit: params.limit || "100",
  })) as any;
  results.push(...(firstPage.data || []));

  let nextUrl: string | null = firstPage.paging?.next || null;

  while (nextUrl && results.length < 500) {
    const res = await fetch(nextUrl, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) break;
    const page = (await res.json()) as any;
    results.push(...(page.data || []));
    nextUrl = page.paging?.next || null;
  }

  return results;
}

// ─── Google Ads helpers ──────────────────────────────────────────

const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

let googleAccessToken: string | null = null;
let googleTokenExpiresAt = 0;

async function getGoogleAccessToken(): Promise<string> {
  if (googleAccessToken && Date.now() < googleTokenExpiresAt) {
    return googleAccessToken;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google OAuth token refresh failed ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  googleAccessToken = data.access_token;
  googleTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return googleAccessToken;
}

function getGoogleCustomerId(): string {
  return (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
}

async function googleAdsQuery(gaql: string): Promise<unknown[]> {
  const token = await getGoogleAccessToken();
  const customerId = getGoogleCustomerId();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    "Content-Type": "application/json",
  };
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(
    /-/g,
    "",
  );
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const res = await fetch(
    `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query: gaql }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Ads API ${res.status}: ${body}`);
  }

  const data = (await res.json()) as any[];
  return data.flatMap((batch: any) => batch.results || []);
}

// ─── Main executor ───────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    // ── Mixpanel tools ──────────────────────────────────────
    if (name === "mixpanel_segmentation") {
      const params: Record<string, string> = {
        event: input.event as string,
        from_date: input.from_date as string,
        to_date: input.to_date as string,
      };
      if (input.unit) params.unit = input.unit as string;
      if (input.type) params.type = input.type as string;
      if (input.on) params.on = input.on as string;
      if (input.where) params.where = input.where as string;
      const data = await mixpanelGet("segmentation", params);
      return stringify(data);
    }

    if (name === "mixpanel_export_events") {
      const limit = (input.limit as number) || 100;
      const url = new URL(`${mixpanelExportUrl()}/export`);
      url.searchParams.set("project_id", getMixpanelProjectId());
      url.searchParams.set("from_date", input.from_date as string);
      url.searchParams.set("to_date", input.to_date as string);
      if (input.event)
        url.searchParams.set("event", JSON.stringify(input.event));
      if (input.where)
        url.searchParams.set("where", input.where as string);
      if (limit) url.searchParams.set("limit", String(limit));

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: getMixpanelAuth(),
          Accept: "text/plain",
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mixpanel Export API ${res.status}: ${body}`);
      }

      const text = await res.text();
      const events = text
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      return stringify({ total: events.length, events });
    }

    if (name === "mixpanel_profiles") {
      const data = await mixpanelPost("engage", {
        where: input.where,
        output_properties: input.output_properties,
        page_size: input.page_size,
      });
      return stringify(data);
    }

    if (name === "mixpanel_funnels") {
      const params: Record<string, string> = {
        funnel_id: String(input.funnel_id),
        from_date: input.from_date as string,
        to_date: input.to_date as string,
      };
      if (input.length) params.length = String(input.length);
      if (input.unit) params.unit = input.unit as string;
      if (input.on) params.on = input.on as string;
      if (input.where) params.where = input.where as string;
      const data = await mixpanelGet("funnels", params);
      return stringify(data);
    }

    if (name === "mixpanel_retention") {
      const params: Record<string, string> = {
        from_date: input.from_date as string,
        to_date: input.to_date as string,
      };
      if (input.born_event) params.born_event = input.born_event as string;
      if (input.event) params.event = input.event as string;
      if (input.retention_type)
        params.retention_type = input.retention_type as string;
      if (input.unit) params.unit = input.unit as string;
      const data = await mixpanelGet("retention", params);
      return stringify(data);
    }

    if (name === "mixpanel_jql") {
      const data = await mixpanelPost("jql", {
        script: input.script as string,
      });
      return stringify(data);
    }

    // ── HubSpot tools ───────────────────────────────────────

    if (name === "hubspot_search_contacts") {
      const data = await hubspotSearch("contacts", {
        query: input.query as string | undefined,
        filters: input.filters as SearchFilter[] | undefined,
        properties: input.properties as string[] | undefined,
        limit: input.limit as number | undefined,
        after: input.after as string | undefined,
      });
      return stringify(data);
    }

    if (name === "hubspot_get_contact") {
      const props = input.properties as string[] | undefined;
      const params = new URLSearchParams();
      if (props) {
        for (const p of props) params.append("properties", p);
      }
      const qs = params.toString();
      const data = await hubspotGet(
        `/crm/v3/objects/contacts/${input.id}${qs ? `?${qs}` : ""}`,
      );
      return stringify({
        id: data.id,
        properties: data.properties,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    }

    if (name === "hubspot_search_deals") {
      const data = await hubspotSearch("deals", {
        query: input.query as string | undefined,
        filters: input.filters as SearchFilter[] | undefined,
        properties: input.properties as string[] | undefined,
        limit: input.limit as number | undefined,
        after: input.after as string | undefined,
      });
      return stringify(data);
    }

    if (name === "hubspot_get_deal") {
      const props = input.properties as string[] | undefined;
      const params = new URLSearchParams();
      if (props) {
        for (const p of props) params.append("properties", p);
      }
      const qs = params.toString();
      const data = await hubspotGet(
        `/crm/v3/objects/deals/${input.id}${qs ? `?${qs}` : ""}`,
      );
      return stringify({
        id: data.id,
        properties: data.properties,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    }

    if (name === "hubspot_list_pipelines") {
      const objectType = (input.objectType as string) || "deals";
      const data = await hubspotGet(
        `/crm/v3/pipelines/${objectType}`,
      );
      const pipelines = (data.results || []).map((p: any) => ({
        id: p.id,
        label: p.label,
        displayOrder: p.displayOrder,
        stages: (p.stages || []).map((s: any) => ({
          id: s.id,
          label: s.label,
          displayOrder: s.displayOrder,
        })),
      }));
      return stringify(pipelines);
    }

    if (name === "hubspot_list_owners") {
      const limit = (input.limit as number) || 100;
      const data = await hubspotGet(
        `/crm/v3/owners?limit=${limit}`,
      );
      const owners = (data.results || []).map((o: any) => ({
        id: o.id,
        email: o.email,
        firstName: o.firstName,
        lastName: o.lastName,
        userId: o.userId,
        teams: o.teams,
      }));
      return stringify(owners);
    }

    if (name === "hubspot_get_properties") {
      const data = await hubspotGet(
        `/crm/v3/properties/${input.objectType}`,
      );
      const props = (data.results || []).map((p: any) => ({
        name: p.name,
        label: p.label,
        type: p.type,
        fieldType: p.fieldType,
        description: p.description,
        groupName: p.groupName,
        options: p.options?.map((o: any) => ({
          label: o.label,
          value: o.value,
        })),
      }));
      return stringify(props);
    }

    if (name === "hubspot_get_contact_notes") {
      const data = await getAssociatedObjects(
        "contacts",
        input.contactId as string,
        "notes",
        [
          "hs_note_body",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_attachment_ids",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_contact_calls") {
      const data = await getAssociatedObjects(
        "contacts",
        input.contactId as string,
        "calls",
        [
          "hs_call_body",
          "hs_call_title",
          "hs_call_direction",
          "hs_call_disposition",
          "hs_call_duration",
          "hs_call_status",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_call_recording_url",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_contact_emails") {
      const data = await getAssociatedObjects(
        "contacts",
        input.contactId as string,
        "emails",
        [
          "hs_email_subject",
          "hs_email_text",
          "hs_email_direction",
          "hs_email_status",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_email_sender_email",
          "hs_email_to_email",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_contact_tasks") {
      const data = await getAssociatedObjects(
        "contacts",
        input.contactId as string,
        "tasks",
        [
          "hs_task_body",
          "hs_task_subject",
          "hs_task_status",
          "hs_task_priority",
          "hs_task_type",
          "hs_timestamp",
          "hubspot_owner_id",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_contact_meetings") {
      const data = await getAssociatedObjects(
        "contacts",
        input.contactId as string,
        "meetings",
        [
          "hs_meeting_body",
          "hs_meeting_title",
          "hs_meeting_start_time",
          "hs_meeting_end_time",
          "hs_meeting_outcome",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_meeting_location",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_contact_deals") {
      const defaultProps = [
        "dealname",
        "amount",
        "dealstage",
        "pipeline",
        "closedate",
        "hubspot_owner_id",
        "createdate",
        "hs_lastmodifieddate",
      ];
      const data = await getAssociatedObjects(
        "contacts",
        input.contactId as string,
        "deals",
        (input.properties as string[]) || defaultProps,
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_owner") {
      const data = await hubspotGet(
        `/crm/v3/owners/${input.ownerId}`,
      );
      return stringify({
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        userId: data.userId,
        teams: data.teams,
      });
    }

    if (name === "hubspot_get_contact_communications") {
      const data = await getAssociatedObjects(
        "contacts",
        input.contactId as string,
        "communications",
        [
          "hs_communication_channel_type",
          "hs_communication_body",
          "hs_communication_logged_from",
          "hs_timestamp",
          "hubspot_owner_id",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    // ── Deal engagements ────────────────────────────────────

    if (name === "hubspot_get_deal_notes") {
      const data = await getAssociatedObjects(
        "deals",
        input.dealId as string,
        "notes",
        [
          "hs_note_body",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_attachment_ids",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_deal_calls") {
      const data = await getAssociatedObjects(
        "deals",
        input.dealId as string,
        "calls",
        [
          "hs_call_body",
          "hs_call_title",
          "hs_call_direction",
          "hs_call_disposition",
          "hs_call_duration",
          "hs_call_status",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_call_recording_url",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_deal_emails") {
      const data = await getAssociatedObjects(
        "deals",
        input.dealId as string,
        "emails",
        [
          "hs_email_subject",
          "hs_email_text",
          "hs_email_direction",
          "hs_email_status",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_email_sender_email",
          "hs_email_to_email",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_deal_tasks") {
      const data = await getAssociatedObjects(
        "deals",
        input.dealId as string,
        "tasks",
        [
          "hs_task_body",
          "hs_task_subject",
          "hs_task_status",
          "hs_task_priority",
          "hs_task_type",
          "hs_timestamp",
          "hubspot_owner_id",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_deal_meetings") {
      const data = await getAssociatedObjects(
        "deals",
        input.dealId as string,
        "meetings",
        [
          "hs_meeting_body",
          "hs_meeting_title",
          "hs_meeting_start_time",
          "hs_meeting_end_time",
          "hs_meeting_outcome",
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_meeting_location",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_deal_communications") {
      const data = await getAssociatedObjects(
        "deals",
        input.dealId as string,
        "communications",
        [
          "hs_communication_channel_type",
          "hs_communication_body",
          "hs_communication_logged_from",
          "hs_timestamp",
          "hubspot_owner_id",
        ],
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_deal_contacts") {
      const defaultProps = [
        "email",
        "firstname",
        "lastname",
        "phone",
        "hs_lead_status",
        "hubspot_owner_id",
        "lifecyclestage",
      ];
      const data = await getAssociatedObjects(
        "deals",
        input.dealId as string,
        "contacts",
        (input.properties as string[]) || defaultProps,
        (input.limit as number) || 100,
      );
      return stringify(data);
    }

    // ── Property history ────────────────────────────────────

    if (name === "hubspot_get_property_history") {
      const objectType = input.objectType as string;
      const objectId = input.objectId as string;
      const properties = input.properties as string[];

      const params = new URLSearchParams();
      for (const p of properties) params.append("propertiesWithHistory", p);

      const data = await hubspotGet(
        `/crm/v3/objects/${objectType}/${objectId}?${params.toString()}`,
      );

      const history: Record<string, any[]> = {};
      for (const prop of properties) {
        history[prop] = (data.propertiesWithHistory?.[prop] || []).map(
          (h: any) => ({
            value: h.value,
            timestamp: h.timestamp,
            sourceType: h.sourceType,
            sourceId: h.sourceId,
            sourceLabel: h.sourceLabel,
            updatedByUserId: h.updatedByUserId,
          }),
        );
      }

      return stringify({ id: data.id, properties: data.properties, history });
    }

    // ── Lists ───────────────────────────────────────────────

    if (name === "hubspot_search_lists") {
      const data = await hubspotPost("/crm/v3/lists/search", {
        query: input.query as string,
        count: (input.limit as number) || 25,
      });
      return stringify({
        total: data.total ?? (data.lists || []).length,
        lists: (data.lists || []).map((l: any) => ({
          listId: l.listId,
          name: l.name,
          size: l.size,
          listType: l.listType,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        })),
      });
    }

    if (name === "hubspot_get_list") {
      const data = await hubspotGet(`/crm/v3/lists/${input.listId}`);
      return stringify({
        listId: data.listId,
        name: data.name,
        size: data.size,
        listType: data.listType,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        filterBranch: data.filterBranch,
      });
    }

    if (name === "hubspot_get_list_members") {
      const params = new URLSearchParams();
      params.set("limit", String((input.limit as number) || 100));
      if (input.after) params.set("after", input.after as string);
      const data = await hubspotGet(
        `/crm/v3/lists/${input.listId}/memberships?${params.toString()}`,
      );
      return stringify({
        results: data.results || [],
        paging: data.paging,
      });
    }

    // ── Companies ───────────────────────────────────────────

    if (name === "hubspot_search_companies") {
      const data = await hubspotSearch("companies", {
        query: input.query as string | undefined,
        filters: input.filters as SearchFilter[] | undefined,
        properties: input.properties as string[] | undefined,
        limit: input.limit as number | undefined,
        after: input.after as string | undefined,
      });
      return stringify(data);
    }

    if (name === "hubspot_get_company") {
      const props = input.properties as string[] | undefined;
      const params = new URLSearchParams();
      if (props) {
        for (const p of props) params.append("properties", p);
      }
      const qs = params.toString();
      const data = await hubspotGet(
        `/crm/v3/objects/companies/${input.id}${qs ? `?${qs}` : ""}`,
      );
      return stringify({
        id: data.id,
        properties: data.properties,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    }

    // ── Marketing Emails ────────────────────────────────────

    if (name === "hubspot_list_marketing_emails") {
      const params = new URLSearchParams();
      params.set("limit", String((input.limit as number) || 50));
      if (input.after) params.set("after", input.after as string);
      const data = await hubspotGet(
        `/marketing/v3/emails?${params.toString()}`,
      );
      return stringify({
        total: data.total ?? (data.results || []).length,
        results: (data.results || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          subject: e.subject,
          type: e.type,
          state: e.state,
          publishDate: e.publishDate,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          stats: e.statistics,
        })),
        paging: data.paging,
      });
    }

    if (name === "hubspot_get_marketing_email") {
      const data = await hubspotGet(
        `/marketing/v3/emails/${input.emailId}`,
      );
      return stringify(data);
    }

    if (name === "hubspot_get_marketing_email_stats") {
      const data = await hubspotGet(
        `/marketing/v3/emails/${input.emailId}/statistics`,
      );
      return stringify(data);
    }

    // ── Workflows ───────────────────────────────────────────

    if (name === "hubspot_list_workflows") {
      const params = new URLSearchParams();
      params.set("limit", String((input.limit as number) || 100));
      if (input.after) params.set("after", input.after as string);
      const data = await hubspotGet(
        `/automation/v4/flows?${params.toString()}`,
      );
      return stringify({
        total: data.total ?? (data.results || []).length,
        results: (data.results || []).map((flow: any) => ({
          id: flow.id,
          name: flow.name,
          type: flow.type,
          enabled: flow.enabled,
          insertedAt: flow.insertedAt,
          updatedAt: flow.updatedAt,
          enrollmentTriggers: flow.enrollmentTriggers,
        })),
        paging: data.paging,
      });
    }

    if (name === "hubspot_get_workflow") {
      const data = await hubspotGet(
        `/automation/v4/flows/${input.flowId}`,
      );
      return stringify(data);
    }

    // ── Custom objects & schemas ─────────────────────────────

    if (name === "hubspot_list_schemas") {
      const data = await hubspotGet("/crm/v3/schemas");
      const schemas = (data.results || []).map((s: any) => ({
        id: s.objectTypeId,
        name: s.name,
        labels: s.labels,
        primaryDisplayProperty: s.primaryDisplayProperty,
        properties: (s.properties || []).map((p: any) => ({
          name: p.name,
          label: p.label,
          type: p.type,
        })),
        associations: (s.associations || []).map((a: any) => ({
          id: a.id,
          fromObjectTypeId: a.fromObjectTypeId,
          toObjectTypeId: a.toObjectTypeId,
          name: a.name,
        })),
      }));
      return stringify(schemas);
    }

    if (name === "hubspot_get_contact_custom_objects") {
      const contactId = input.contactId as string;
      const customObjectType = input.customObjectType as string;
      const properties = input.properties as string[] | undefined;
      const limit = (input.limit as number) || 100;

      const assocData = await hubspotGet(
        `/crm/v4/objects/contacts/${contactId}/associations/${customObjectType}`,
      );
      const ids: string[] = (assocData.results || []).map((r: any) =>
        String(r.toObjectId),
      );
      if (ids.length === 0) return stringify({ results: [], total: 0 });

      const batchData = await hubspotPost(
        `/crm/v3/objects/${customObjectType}/batch/read`,
        {
          inputs: ids.slice(0, limit).map((id) => ({ id })),
          properties: properties || [],
        },
      );
      return stringify({
        results: (batchData.results || []).map((obj: any) => ({
          id: obj.id,
          properties: obj.properties,
          createdAt: obj.createdAt,
          updatedAt: obj.updatedAt,
        })),
        total: ids.length,
      });
    }

    if (name === "hubspot_get_deal_custom_objects") {
      const dealId = input.dealId as string;
      const customObjectType = input.customObjectType as string;
      const properties = input.properties as string[] | undefined;
      const limit = (input.limit as number) || 100;

      const assocData = await hubspotGet(
        `/crm/v4/objects/deals/${dealId}/associations/${customObjectType}`,
      );
      const ids: string[] = (assocData.results || []).map((r: any) =>
        String(r.toObjectId),
      );
      if (ids.length === 0) return stringify({ results: [], total: 0 });

      const batchData = await hubspotPost(
        `/crm/v3/objects/${customObjectType}/batch/read`,
        {
          inputs: ids.slice(0, limit).map((id) => ({ id })),
          properties: properties || [],
        },
      );
      return stringify({
        results: (batchData.results || []).map((obj: any) => ({
          id: obj.id,
          properties: obj.properties,
          createdAt: obj.createdAt,
          updatedAt: obj.updatedAt,
        })),
        total: ids.length,
      });
    }

    // ── Knowledge tools ─────────────────────────────────────

    if (name === "medicus_project_info") {
      const project = projects[input.project as string];
      if (!project) {
        const available = Object.keys(projects).join(", ");
        return stringify({
          error: `Proyecto '${input.project}' no encontrado. Proyectos disponibles: ${available}`,
        });
      }

      const section = (input.section as string) || "all";

      if (section === "all") {
        return stringify({
          name: project.name,
          description: project.description,
          framework: project.framework,
          role: project.role,
          totalMixpanelEvents: project.mixpanelEvents.length,
          totalHubSpotOperations: project.hubspotOperations.length,
          mixpanelEvents: project.mixpanelEvents,
          hubspotOperations: project.hubspotOperations,
          userJourney: project.userJourney,
          notes: project.notes,
        });
      }
      if (section === "events") {
        return stringify({
          project: project.name,
          totalEvents: project.mixpanelEvents.length,
          events: project.mixpanelEvents,
        });
      }
      if (section === "hubspot") {
        return stringify({
          project: project.name,
          totalOperations: project.hubspotOperations.length,
          operations: project.hubspotOperations,
        });
      }
      if (section === "journey") {
        return stringify({
          project: project.name,
          journey: project.userJourney?.length
            ? project.userJourney
            : "Este proyecto no tiene un user journey definido (es un servicio backend o herramienta interna).",
        });
      }
      if (section === "notes") {
        return stringify({
          project: project.name,
          notes: project.notes,
        });
      }
      return stringify(project);
    }

    if (name === "medicus_search_events") {
      const results = searchEvents(input.query as string);
      if (results.length === 0) {
        return stringify({
          query: input.query,
          totalResults: 0,
          message: `No se encontraron eventos que coincidan con '${input.query}'. Intenta con otro termino.`,
        });
      }
      return stringify({
        query: input.query,
        totalResults: results.length,
        results: results.map((r) => ({
          project: r.project,
          eventName: r.event.name,
          trigger: r.event.trigger,
          properties: r.event.properties,
          component: r.event.component,
          step: r.event.step,
        })),
      });
    }

    if (name === "medicus_search_hubspot_ops") {
      const results = searchHubSpotOps(input.query as string);
      if (results.length === 0) {
        return stringify({
          query: input.query,
          totalResults: 0,
          message: `No se encontraron operaciones HubSpot que coincidan con '${input.query}'.`,
        });
      }
      return stringify({
        query: input.query,
        totalResults: results.length,
        results: results.map((r) => ({
          project: r.project,
          method: r.operation.method,
          endpoint: r.operation.endpoint,
          description: r.operation.description,
          trigger: r.operation.trigger,
          dataFlow: r.operation.dataFlow,
        })),
      });
    }

    if (name === "medicus_report_format") {
      const format = reportFormats[input.type as string];
      if (!format) {
        const available = Object.keys(reportFormats).join(", ");
        return stringify({
          error: `Tipo de reporte '${input.type}' no encontrado. Tipos disponibles: ${available}`,
        });
      }
      return stringify(format);
    }

    if (name === "medicus_ecosystem_overview") {
      const overview = Object.entries(projects).map(([key, p]) => ({
        project: key,
        description: p.description,
        role: p.role,
        framework: p.framework,
        mixpanelEvents: p.mixpanelEvents.length,
        hubspotOperations: p.hubspotOperations.length,
        hasUserJourney: (p.userJourney?.length ?? 0) > 0,
      }));

      const totalEvents = overview.reduce(
        (sum, p) => sum + p.mixpanelEvents,
        0,
      );
      const totalHubSpotOps = overview.reduce(
        (sum, p) => sum + p.hubspotOperations,
        0,
      );

      return stringify({
        summary: {
          totalProjects: overview.length,
          totalMixpanelEvents: totalEvents,
          totalHubSpotOperations: totalHubSpotOps,
          projectsWithMixpanel: overview
            .filter((p) => p.mixpanelEvents > 0)
            .map((p) => p.project),
          projectsWithHubSpot: overview
            .filter((p) => p.hubspotOperations > 0)
            .map((p) => p.project),
        },
        projects: overview,
        businessFlow: [
          "1. ENTRADA: Usuario llega via web (arma-tu-plan) o WhatsApp (whatsapp-flow)",
          "2. COTIZACION: Selecciona cobertura, cartilla, plan → eventos Mixpanel trackean cada paso",
          "3. CREACION EN CRM: Prospecto creado en HubSpot via huspot-api (gateway central)",
          "4. ASIGNACION: asignaciones-dashboard calcula scoring y asigna asesor al contacto",
          "5. REGISTRO: Usuario redirigido a portal-socios para completar alta online",
          "6. PORTAL: DNI, biometria, DDJJ, documentos, firma, pago → todo trackeado en Mixpanel con checkIn/checkOut",
          "7. AFILIACION: prospectos-nest-js transforma prospecto en afiliado via Oracle PL/SQL",
          "8. MEDICARD: Se emite la credencial de socio",
          "",
          "HERRAMIENTAS INTERNAS:",
          "- bases-recontacto: Cruza listas de contactos contra HubSpot",
          "- cruce-mios: Reconcilia contactos de campana MIOS",
          "- asignaciones-dashboard: Scoring y asignacion de asesores",
        ],
        dataSources: {
          "HubSpot CRM":
            "Fuente de verdad del pipeline de ventas (contactos, deals, notas)",
          "Oracle DB":
            "Fuente de verdad de afiliados/socios activos",
          Mixpanel:
            "Analytics de comportamiento de usuario en frontends",
        },
      });
    }

    // ── Meta Ads tools ──────────────────────────────────────

    if (name === "meta_ads_get_campaigns") {
      const adAccountId = getMetaAdAccountId();
      const fields =
        "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
      const queryParams: Record<string, string> = { fields };

      if (input.status) {
        queryParams.filtering = JSON.stringify([
          {
            field: "effective_status",
            operator: "IN",
            value: [input.status],
          },
        ]);
      }
      if (input.limit) queryParams.limit = String(input.limit);

      const data = await metaGetPaginated(
        `/${adAccountId}/campaigns`,
        queryParams,
      );
      return stringify({ total: data.length, campaigns: data });
    }

    if (name === "meta_ads_account_insights") {
      const adAccountId = getMetaAdAccountId();
      const fields = [
        "spend",
        "impressions",
        "reach",
        "frequency",
        "clicks",
        "cpc",
        "cpm",
        "ctr",
        "cpp",
        "actions",
        "cost_per_action_type",
        "campaign_name",
        "campaign_id",
      ].join(",");

      const queryParams: Record<string, string> = {
        fields,
        time_range: JSON.stringify({
          since: input.since as string,
          until: input.until as string,
        }),
      };

      if (input.time_increment)
        queryParams.time_increment = input.time_increment as string;
      if (input.breakdowns)
        queryParams.breakdowns = input.breakdowns as string;

      const data = await metaGetPaginated(
        `/${adAccountId}/insights`,
        queryParams,
      );
      return stringify({ total: data.length, insights: data });
    }

    if (name === "meta_ads_campaign_insights") {
      const adAccountId = getMetaAdAccountId();
      const fields = [
        "campaign_name",
        "campaign_id",
        "spend",
        "impressions",
        "reach",
        "frequency",
        "clicks",
        "cpc",
        "cpm",
        "ctr",
        "actions",
        "cost_per_action_type",
      ].join(",");

      const queryParams: Record<string, string> = {
        fields,
        time_range: JSON.stringify({
          since: input.since as string,
          until: input.until as string,
        }),
        level: "campaign",
      };

      if (input.time_increment)
        queryParams.time_increment = input.time_increment as string;

      if (
        input.campaign_ids &&
        (input.campaign_ids as string[]).length > 0
      ) {
        queryParams.filtering = JSON.stringify([
          {
            field: "campaign.id",
            operator: "IN",
            value: input.campaign_ids,
          },
        ]);
      }

      const data = await metaGetPaginated(
        `/${adAccountId}/insights`,
        queryParams,
      );
      return stringify({ total: data.length, insights: data });
    }

    if (name === "meta_ads_adset_insights") {
      const adAccountId = getMetaAdAccountId();
      const fields = [
        "campaign_name",
        "campaign_id",
        "adset_name",
        "adset_id",
        "spend",
        "impressions",
        "reach",
        "clicks",
        "cpc",
        "cpm",
        "ctr",
        "actions",
        "cost_per_action_type",
      ].join(",");

      const queryParams: Record<string, string> = {
        fields,
        time_range: JSON.stringify({
          since: input.since as string,
          until: input.until as string,
        }),
        level: "adset",
      };

      if (input.time_increment)
        queryParams.time_increment = input.time_increment as string;

      if (
        input.campaign_ids &&
        (input.campaign_ids as string[]).length > 0
      ) {
        queryParams.filtering = JSON.stringify([
          {
            field: "campaign.id",
            operator: "IN",
            value: input.campaign_ids,
          },
        ]);
      }

      const data = await metaGetPaginated(
        `/${adAccountId}/insights`,
        queryParams,
      );
      return stringify({ total: data.length, insights: data });
    }

    // ── Google Ads tools ────────────────────────────────────

    if (name === "google_ads_account_metrics") {
      const gaql = `
        SELECT
          segments.date,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.conversions, metrics.conversions_value,
          metrics.ctr, metrics.average_cpc, metrics.average_cpm,
          metrics.interactions
        FROM customer
        WHERE segments.date BETWEEN '${input.since}' AND '${input.until}'
        ORDER BY segments.date DESC
      `;
      const results = await googleAdsQuery(gaql);
      const metrics = results.map((row: any) => ({
        date: row.segments?.date,
        impressions: Number(row.metrics?.impressions || 0),
        clicks: Number(row.metrics?.clicks || 0),
        spend: Number(row.metrics?.costMicros || 0) / 1_000_000,
        conversions: Number(row.metrics?.conversions || 0),
        conversions_value: Number(row.metrics?.conversionsValue || 0),
        ctr: Number(row.metrics?.ctr || 0),
        avg_cpc: Number(row.metrics?.averageCpc || 0) / 1_000_000,
        avg_cpm: Number(row.metrics?.averageCpm || 0) / 1_000_000,
        interactions: Number(row.metrics?.interactions || 0),
      }));
      return stringify({ total: metrics.length, metrics });
    }

    if (name === "google_ads_campaign_metrics") {
      let where = `segments.date BETWEEN '${input.since}' AND '${input.until}'`;
      if (
        input.campaign_ids &&
        (input.campaign_ids as string[]).length > 0
      ) {
        where += ` AND campaign.id IN (${(input.campaign_ids as string[]).join(",")})`;
      }
      if (input.status) {
        where += ` AND campaign.status = '${input.status}'`;
      }

      const gaql = `
        SELECT
          campaign.id, campaign.name, campaign.status,
          campaign.advertising_channel_type,
          segments.date,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.conversions, metrics.conversions_value,
          metrics.ctr, metrics.average_cpc, metrics.average_cpm
        FROM campaign
        WHERE ${where}
        ORDER BY segments.date DESC
      `;

      const results = await googleAdsQuery(gaql);
      const metrics = results.map((row: any) => ({
        date: row.segments?.date,
        campaign_id: row.campaign?.id,
        campaign_name: row.campaign?.name,
        status: row.campaign?.status,
        channel_type: row.campaign?.advertisingChannelType,
        impressions: Number(row.metrics?.impressions || 0),
        clicks: Number(row.metrics?.clicks || 0),
        spend: Number(row.metrics?.costMicros || 0) / 1_000_000,
        conversions: Number(row.metrics?.conversions || 0),
        conversions_value: Number(row.metrics?.conversionsValue || 0),
        ctr: Number(row.metrics?.ctr || 0),
        avg_cpc: Number(row.metrics?.averageCpc || 0) / 1_000_000,
        avg_cpm: Number(row.metrics?.averageCpm || 0) / 1_000_000,
      }));
      return stringify({ total: metrics.length, metrics });
    }

    if (name === "google_ads_keyword_metrics") {
      let where = `segments.date BETWEEN '${input.since}' AND '${input.until}'`;
      if (
        input.campaign_ids &&
        (input.campaign_ids as string[]).length > 0
      ) {
        where += ` AND campaign.id IN (${(input.campaign_ids as string[]).join(",")})`;
      }

      const gaql = `
        SELECT
          campaign.name, ad_group.name,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          segments.date,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.conversions, metrics.ctr, metrics.average_cpc
        FROM keyword_view
        WHERE ${where}
        ORDER BY metrics.cost_micros DESC
      `;

      const results = await googleAdsQuery(gaql);
      const keywords = results.map((row: any) => ({
        date: row.segments?.date,
        campaign: row.campaign?.name,
        ad_group: row.adGroup?.name,
        keyword: row.adGroupCriterion?.keyword?.text,
        match_type: row.adGroupCriterion?.keyword?.matchType,
        impressions: Number(row.metrics?.impressions || 0),
        clicks: Number(row.metrics?.clicks || 0),
        spend: Number(row.metrics?.costMicros || 0) / 1_000_000,
        conversions: Number(row.metrics?.conversions || 0),
        ctr: Number(row.metrics?.ctr || 0),
        avg_cpc: Number(row.metrics?.averageCpc || 0) / 1_000_000,
      }));
      return stringify({ total: keywords.length, keywords });
    }

    if (name === "google_ads_query") {
      const results = await googleAdsQuery(input.query as string);
      return stringify({ total: results.length, results });
    }

    // ── Unknown tool ────────────────────────────────────────

    return stringify({
      error: `Unknown tool: ${name}`,
    });
  } catch (err: any) {
    return stringify({
      error: err.message || String(err),
    });
  }
}
