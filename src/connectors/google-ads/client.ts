const GOOGLE_ADS_API_VERSION = "v18";
const BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleAdsConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
}

/** Shape of a Google Ads searchStream result row. */
interface GoogleAdsRow {
  segments?: { date?: string };
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
  customer?: Record<string, unknown>;
  metrics?: {
    impressions?: string; clicks?: string; costMicros?: string;
    conversions?: string; conversionsValue?: string;
    ctr?: string; averageCpc?: string; averageCpm?: string;
    interactions?: string;
  };
  adGroup?: { name?: string };
  adGroupCriterion?: { keyword?: { text?: string; matchType?: string } };
}

export class GoogleAdsClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private developerToken: string;
  private customerId: string;
  private loginCustomerId?: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(cfg: GoogleAdsConfig) {
    this.clientId = cfg.clientId;
    this.clientSecret = cfg.clientSecret;
    this.refreshToken = cfg.refreshToken;
    this.developerToken = cfg.developerToken;
    this.customerId = cfg.customerId.replace(/-/g, "");
    this.loginCustomerId = cfg.loginCustomerId?.replace(/-/g, "");
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google OAuth token refresh failed ${res.status}: ${body}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async query(gaql: string): Promise<GoogleAdsRow[]> {
    const token = await this.getAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": this.developerToken,
      "Content-Type": "application/json",
    };
    if (this.loginCustomerId) {
      headers["login-customer-id"] = this.loginCustomerId;
    }

    const res = await fetch(
      `${BASE_URL}/customers/${this.customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query: gaql }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Ads API ${res.status}: ${body}`);
    }

    interface SearchStreamBatch {
      results?: GoogleAdsRow[];
    }
    const data = await res.json() as SearchStreamBatch[];
    // searchStream retorna un array de batches, cada uno con results
    return data.flatMap((batch) => batch.results || []);
  }

  async campaignMetrics(params: {
    since: string;
    until: string;
    campaign_ids?: string[];
    status?: string;
  }) {
    let where = `segments.date BETWEEN '${params.since}' AND '${params.until}'`;
    if (params.campaign_ids && params.campaign_ids.length > 0) {
      where += ` AND campaign.id IN (${params.campaign_ids.join(",")})`;
    }
    if (params.status) {
      where += ` AND campaign.status = '${params.status}'`;
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

    const results = await this.query(gaql);

    return results.map((row) => ({
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
  }

  async accountMetrics(params: {
    since: string;
    until: string;
  }) {
    const gaql = `
      SELECT
        segments.date,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value,
        metrics.ctr, metrics.average_cpc, metrics.average_cpm,
        metrics.interactions
      FROM customer
      WHERE segments.date BETWEEN '${params.since}' AND '${params.until}'
      ORDER BY segments.date DESC
    `;

    const results = await this.query(gaql);

    return results.map((row) => ({
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
  }

  async keywordMetrics(params: {
    since: string;
    until: string;
    campaign_ids?: string[];
  }) {
    let where = `segments.date BETWEEN '${params.since}' AND '${params.until}'`;
    if (params.campaign_ids && params.campaign_ids.length > 0) {
      where += ` AND campaign.id IN (${params.campaign_ids.join(",")})`;
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

    const results = await this.query(gaql);

    return results.map((row) => ({
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
  }

  async customQuery(gaql: string) {
    return this.query(gaql);
  }
}
