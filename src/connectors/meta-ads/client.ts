const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

interface MetaAdsConfig {
  accessToken: string;
  adAccountId: string;
}

export class MetaAdsClient {
  private accessToken: string;
  private adAccountId: string;

  constructor(cfg: MetaAdsConfig) {
    this.accessToken = cfg.accessToken;
    this.adAccountId = cfg.adAccountId.startsWith("act_")
      ? cfg.adAccountId
      : `act_${cfg.adAccountId}`;
  }

  private async get(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta Ads API ${res.status}: ${body}`);
    }
    return res.json();
  }

  private async getPaginated(endpoint: string, params: Record<string, string> = {}): Promise<unknown[]> {
    const results: unknown[] = [];
    let url: string | null = null;

    interface MetaPaginatedResponse {
      data?: unknown[];
      paging?: { next?: string };
    }

    // Primera pagina
    const firstPage = await this.get(endpoint, { ...params, limit: params.limit || "100" }) as MetaPaginatedResponse;
    results.push(...(firstPage.data || []));

    url = firstPage.paging?.next || null;

    while (url && results.length < 500) {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) break;
      const page = await res.json() as MetaPaginatedResponse;
      results.push(...(page.data || []));
      url = page.paging?.next || null;
    }

    return results;
  }

  async getCampaigns(params: {
    status?: string;
    limit?: number;
  } = {}) {
    const fields = "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
    const queryParams: Record<string, string> = { fields };

    if (params.status) {
      queryParams.filtering = JSON.stringify([{
        field: "effective_status",
        operator: "IN",
        value: [params.status],
      }]);
    }
    if (params.limit) queryParams.limit = String(params.limit);

    return this.getPaginated(`/${this.adAccountId}/campaigns`, queryParams);
  }

  async getAccountInsights(params: {
    since: string;
    until: string;
    time_increment?: string;
    breakdowns?: string;
  }) {
    const fields = [
      "spend", "impressions", "reach", "frequency", "clicks",
      "cpc", "cpm", "ctr", "cpp",
      "actions", "cost_per_action_type",
      "campaign_name", "campaign_id",
    ].join(",");

    const queryParams: Record<string, string> = {
      fields,
      time_range: JSON.stringify({ since: params.since, until: params.until }),
    };

    if (params.time_increment) queryParams.time_increment = params.time_increment;
    if (params.breakdowns) queryParams.breakdowns = params.breakdowns;

    return this.getPaginated(`/${this.adAccountId}/insights`, queryParams);
  }

  async getCampaignInsights(params: {
    since: string;
    until: string;
    time_increment?: string;
    campaign_ids?: string[];
  }) {
    const fields = [
      "campaign_name", "campaign_id",
      "spend", "impressions", "reach", "frequency", "clicks",
      "cpc", "cpm", "ctr",
      "actions", "cost_per_action_type",
    ].join(",");

    const queryParams: Record<string, string> = {
      fields,
      time_range: JSON.stringify({ since: params.since, until: params.until }),
      level: "campaign",
    };

    if (params.time_increment) queryParams.time_increment = params.time_increment;

    if (params.campaign_ids && params.campaign_ids.length > 0) {
      queryParams.filtering = JSON.stringify([{
        field: "campaign.id",
        operator: "IN",
        value: params.campaign_ids,
      }]);
    }

    return this.getPaginated(`/${this.adAccountId}/insights`, queryParams);
  }

  async getAdSetInsights(params: {
    since: string;
    until: string;
    time_increment?: string;
    campaign_ids?: string[];
  }) {
    const fields = [
      "campaign_name", "campaign_id", "adset_name", "adset_id",
      "spend", "impressions", "reach", "clicks",
      "cpc", "cpm", "ctr",
      "actions", "cost_per_action_type",
    ].join(",");

    const queryParams: Record<string, string> = {
      fields,
      time_range: JSON.stringify({ since: params.since, until: params.until }),
      level: "adset",
    };

    if (params.time_increment) queryParams.time_increment = params.time_increment;

    if (params.campaign_ids && params.campaign_ids.length > 0) {
      queryParams.filtering = JSON.stringify([{
        field: "campaign.id",
        operator: "IN",
        value: params.campaign_ids,
      }]);
    }

    return this.getPaginated(`/${this.adAccountId}/insights`, queryParams);
  }
}
