import { Client } from "@hubspot/api-client";
import { AudioTranscriber } from "./audio-transcriber.js";

interface SearchFilter {
  propertyName: string;
  operator: string;
  value: string;
}

interface SearchOptions {
  query?: string;
  filters?: SearchFilter[];
  properties?: string[];
  limit?: number;
  after?: string;
  sorts?: string[];
}

export class HubSpotClient {
  private client: Client;
  private audioTranscriber: AudioTranscriber | null;

  constructor(accessToken: string, openaiApiKey?: string) {
    this.client = new Client({ accessToken });
    this.audioTranscriber = openaiApiKey
      ? new AudioTranscriber(openaiApiKey, this.apiGet.bind(this))
      : null;
  }

  async searchContacts(options: SearchOptions) {
    const filterGroups = options.filters?.length
      ? [{ filters: options.filters.map((f) => ({ propertyName: f.propertyName, operator: f.operator, value: f.value })) }]
      : undefined;

    const response = await this.client.crm.contacts.searchApi.doSearch({
      query: options.query,
      filterGroups: filterGroups as never, // TYPE: HubSpot SDK expects FilterGroup[] but our shape is compatible
      properties: options.properties,
      limit: options.limit || 10,
      after: options.after ? String(options.after) : undefined,
      sorts: options.sorts as never, // TYPE: HubSpot SDK sort type is overly strict
    });

    return {
      total: response.total,
      results: response.results.map((c) => ({
        id: c.id,
        properties: c.properties,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      paging: response.paging,
    };
  }

  async getContact(id: string, properties?: string[]) {
    const response = await this.client.crm.contacts.basicApi.getById(
      id,
      properties,
    );
    return {
      id: response.id,
      properties: response.properties,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    };
  }

  async searchDeals(options: SearchOptions) {
    const filterGroups = options.filters?.length
      ? [{ filters: options.filters.map((f) => ({ propertyName: f.propertyName, operator: f.operator, value: f.value })) }]
      : undefined;

    const response = await this.client.crm.deals.searchApi.doSearch({
      query: options.query,
      filterGroups: filterGroups as never, // TYPE: HubSpot SDK expects FilterGroup[] but our shape is compatible
      properties: options.properties,
      limit: options.limit || 10,
      after: options.after ? String(options.after) : undefined,
      sorts: options.sorts as never, // TYPE: HubSpot SDK sort type is overly strict
    });

    return {
      total: response.total,
      results: response.results.map((d) => ({
        id: d.id,
        properties: d.properties,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      paging: response.paging,
    };
  }

  async getDeal(id: string, properties?: string[]) {
    const response = await this.client.crm.deals.basicApi.getById(
      id,
      properties,
    );
    return {
      id: response.id,
      properties: response.properties,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    };
  }

  async listPipelines(objectType: string = "deals") {
    const response = await this.client.crm.pipelines.pipelinesApi.getAll(objectType);
    return response.results.map((p) => ({
      id: p.id,
      label: p.label,
      displayOrder: p.displayOrder,
      stages: p.stages.map((s) => ({
        id: s.id,
        label: s.label,
        displayOrder: s.displayOrder,
      })),
    }));
  }

  async listOwners(limit: number = 100) {
    const response = await this.client.crm.owners.ownersApi.getPage(undefined, undefined, limit);
    return response.results.map((o) => ({
      id: o.id,
      email: o.email,
      firstName: o.firstName,
      lastName: o.lastName,
      userId: o.userId,
      teams: o.teams,
    }));
  }

  async getProperties(objectType: string) {
    const response = await this.client.crm.properties.coreApi.getAll(objectType);
    return response.results.map((p) => ({
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      description: p.description,
      groupName: p.groupName,
      options: p.options?.map((o) => ({ label: o.label, value: o.value })),
    }));
  }

  // ── Engagements & Associations ──────────────────────────────────

  private async apiGet(path: string): Promise<Record<string, unknown>> {
    const resp = await this.client.apiRequest({ method: "GET", path });
    // TYPE: HubSpot SDK apiRequest returns node-fetch Response (not global Response)
    return (resp as unknown as { json(): Promise<Record<string, unknown>> }).json();
  }

  private async apiPost(path: string, body: unknown): Promise<Record<string, unknown>> {
    const resp = await this.client.apiRequest({ method: "POST", path, body });
    // TYPE: HubSpot SDK apiRequest returns node-fetch Response (not global Response)
    return (resp as unknown as { json(): Promise<Record<string, unknown>> }).json();
  }

  private async getAssociatedObjects(
    sourceType: string,
    sourceId: string,
    targetType: string,
    properties: string[],
    limit: number = 100,
  ): Promise<{ results: Array<{ id: string; properties: Record<string, string>; createdAt: string; updatedAt: string }>; total: number }> {
    const assocData = await this.apiGet(
      `/crm/v4/objects/${sourceType}/${sourceId}/associations/${targetType}`,
    );

    const ids: string[] = ((assocData.results || []) as Array<{ toObjectId: string | number }>).map((r) => String(r.toObjectId));
    if (ids.length === 0) return { results: [], total: 0 };

    const batchData = await this.apiPost(
      `/crm/v3/objects/${targetType}/batch/read`,
      { inputs: ids.slice(0, limit).map((id) => ({ id })), properties },
    );

    const results = ((batchData.results || []) as Array<Record<string, unknown>>).map((obj) => ({
      id: obj.id as string,
      properties: obj.properties as Record<string, string>,
      createdAt: obj.createdAt as string,
      updatedAt: obj.updatedAt as string,
    }));

    results.sort((a, b) => {
      const tsA = (a.properties as Record<string, string>).hs_timestamp || a.createdAt || "";
      const tsB = (b.properties as Record<string, string>).hs_timestamp || b.createdAt || "";
      return tsB.localeCompare(tsA);
    });

    return { results, total: ids.length };
  }

  // ── Contact engagements ─────────────────────────────────────

  async getContactNotes(contactId: string, limit?: number) {
    return this.getAssociatedObjects("contacts", contactId, "notes", [
      "hs_note_body", "hs_timestamp", "hubspot_owner_id", "hs_attachment_ids",
    ], limit);
  }

  async getContactCalls(contactId: string, limit?: number) {
    return this.getAssociatedObjects("contacts", contactId, "calls", [
      "hs_call_body", "hs_call_title", "hs_call_direction",
      "hs_call_disposition", "hs_call_duration", "hs_call_status",
      "hs_timestamp", "hubspot_owner_id", "hs_call_recording_url",
    ], limit);
  }

  async getContactEmails(contactId: string, limit?: number) {
    return this.getAssociatedObjects("contacts", contactId, "emails", [
      "hs_email_subject", "hs_email_text", "hs_email_direction",
      "hs_email_status", "hs_timestamp", "hubspot_owner_id",
      "hs_email_sender_email", "hs_email_to_email",
    ], limit);
  }

  async getContactTasks(contactId: string, limit?: number) {
    return this.getAssociatedObjects("contacts", contactId, "tasks", [
      "hs_task_body", "hs_task_subject", "hs_task_status",
      "hs_task_priority", "hs_task_type", "hs_timestamp", "hubspot_owner_id",
    ], limit);
  }

  async getContactMeetings(contactId: string, limit?: number) {
    return this.getAssociatedObjects("contacts", contactId, "meetings", [
      "hs_meeting_body", "hs_meeting_title", "hs_meeting_start_time",
      "hs_meeting_end_time", "hs_meeting_outcome", "hs_timestamp",
      "hubspot_owner_id", "hs_meeting_location",
    ], limit);
  }

  async getContactDeals(contactId: string, properties?: string[], limit?: number) {
    const defaultProps = [
      "dealname", "amount", "dealstage", "pipeline", "closedate",
      "hubspot_owner_id", "createdate", "hs_lastmodifieddate",
    ];
    return this.getAssociatedObjects(
      "contacts", contactId, "deals", properties || defaultProps, limit,
    );
  }

  async getContactCommunications(contactId: string, limit?: number) {
    const data = await this.getAssociatedObjects("contacts", contactId, "communications", [
      "hs_communication_channel_type", "hs_communication_body",
      "hs_communication_logged_from", "hs_timestamp", "hubspot_owner_id",
    ], limit);

    if (this.audioTranscriber) {
      await this.audioTranscriber.transcribeCommunicationBodies(data.results);
    }

    return data;
  }

  // ── Deal engagements ──────────────────────────────────────

  async getDealNotes(dealId: string, limit?: number) {
    return this.getAssociatedObjects("deals", dealId, "notes", [
      "hs_note_body", "hs_timestamp", "hubspot_owner_id", "hs_attachment_ids",
    ], limit);
  }

  async getDealCalls(dealId: string, limit?: number) {
    return this.getAssociatedObjects("deals", dealId, "calls", [
      "hs_call_body", "hs_call_title", "hs_call_direction",
      "hs_call_disposition", "hs_call_duration", "hs_call_status",
      "hs_timestamp", "hubspot_owner_id", "hs_call_recording_url",
    ], limit);
  }

  async getDealEmails(dealId: string, limit?: number) {
    return this.getAssociatedObjects("deals", dealId, "emails", [
      "hs_email_subject", "hs_email_text", "hs_email_direction",
      "hs_email_status", "hs_timestamp", "hubspot_owner_id",
      "hs_email_sender_email", "hs_email_to_email",
    ], limit);
  }

  async getDealTasks(dealId: string, limit?: number) {
    return this.getAssociatedObjects("deals", dealId, "tasks", [
      "hs_task_body", "hs_task_subject", "hs_task_status",
      "hs_task_priority", "hs_task_type", "hs_timestamp", "hubspot_owner_id",
    ], limit);
  }

  async getDealMeetings(dealId: string, limit?: number) {
    return this.getAssociatedObjects("deals", dealId, "meetings", [
      "hs_meeting_body", "hs_meeting_title", "hs_meeting_start_time",
      "hs_meeting_end_time", "hs_meeting_outcome", "hs_timestamp",
      "hubspot_owner_id", "hs_meeting_location",
    ], limit);
  }

  async getDealCommunications(dealId: string, limit?: number) {
    const data = await this.getAssociatedObjects("deals", dealId, "communications", [
      "hs_communication_channel_type", "hs_communication_body",
      "hs_communication_logged_from", "hs_timestamp", "hubspot_owner_id",
    ], limit);

    if (this.audioTranscriber) {
      await this.audioTranscriber.transcribeCommunicationBodies(data.results);
    }

    return data;
  }

  async getDealContacts(dealId: string, properties?: string[], limit?: number) {
    const defaultProps = [
      "email", "firstname", "lastname", "phone",
      "hs_lead_status", "hubspot_owner_id", "lifecyclestage",
    ];
    return this.getAssociatedObjects(
      "deals", dealId, "contacts", properties || defaultProps, limit,
    );
  }

  // ── Custom objects & schemas ──────────────────────────────

  async listSchemas() {
    const data = await this.apiGet("/crm/v3/schemas");
    return ((data.results || []) as Array<Record<string, unknown>>).map((s) => ({
      id: s.objectTypeId as string,
      name: s.name as string,
      labels: s.labels,
      primaryDisplayProperty: s.primaryDisplayProperty as string,
      properties: ((s.properties || []) as Array<Record<string, unknown>>).map((p) => ({
        name: p.name as string,
        label: p.label as string,
        type: p.type as string,
      })),
      associations: ((s.associations || []) as Array<Record<string, unknown>>).map((a) => ({
        id: a.id as string,
        fromObjectTypeId: a.fromObjectTypeId as string,
        toObjectTypeId: a.toObjectTypeId as string,
        name: a.name as string,
      })),
    }));
  }

  async getAssociatedCustomObjects(
    sourceType: string,
    sourceId: string,
    customObjectType: string,
    properties?: string[],
    limit?: number,
  ) {
    const assocData = await this.apiGet(
      `/crm/v4/objects/${sourceType}/${sourceId}/associations/${customObjectType}`,
    );

    const ids: string[] = ((assocData.results || []) as Array<{ toObjectId: string | number }>).map((r) => String(r.toObjectId));
    if (ids.length === 0) return { results: [], total: 0 };

    if (properties && properties.length > 0) {
      const batchData = await this.apiPost(
        `/crm/v3/objects/${customObjectType}/batch/read`,
        { inputs: ids.slice(0, limit || 100).map((id) => ({ id })), properties },
      );
      return {
        results: ((batchData.results || []) as Array<Record<string, unknown>>).map((obj) => ({
          id: obj.id as string,
          properties: obj.properties as Record<string, string>,
          createdAt: obj.createdAt as string,
          updatedAt: obj.updatedAt as string,
        })),
        total: ids.length,
      };
    }

    // Sin properties especificas: leer con propertiesWithHistory=false
    const batchData = await this.apiPost(
      `/crm/v3/objects/${customObjectType}/batch/read`,
      { inputs: ids.slice(0, limit || 100).map((id) => ({ id })), properties: [] },
    );
    return {
      results: ((batchData.results || []) as Array<Record<string, unknown>>).map((obj) => ({
        id: obj.id as string,
        properties: obj.properties as Record<string, string>,
        createdAt: obj.createdAt as string,
        updatedAt: obj.updatedAt as string,
      })),
      total: ids.length,
    };
  }

  // ── Property History ─────────────────────────────────────

  async getPropertyHistory(
    objectType: string,
    objectId: string,
    properties: string[],
  ) {
    const params = new URLSearchParams();
    for (const p of properties) params.append("propertiesWithHistory", p);

    const data = await this.apiGet(
      `/crm/v3/objects/${objectType}/${objectId}?${params.toString()}`,
    );

    const history: Record<string, Array<Record<string, unknown>>> = {};
    for (const prop of properties) {
      history[prop] = (((data.propertiesWithHistory as Record<string, unknown[]>)?.[prop] || []) as Array<Record<string, unknown>>).map((h) => ({
        value: h.value,
        timestamp: h.timestamp,
        sourceType: h.sourceType,
        sourceId: h.sourceId,
        sourceLabel: h.sourceLabel,
        updatedByUserId: h.updatedByUserId,
      }));
    }

    return { id: data.id, properties: data.properties, history };
  }

  // ── Lists ───────────────────────────────────────────────

  async searchLists(query: string, limit: number = 25) {
    const data = await this.apiPost("/crm/v3/lists/search", {
      query,
      count: limit,
    });

    return {
      total: (data.total as number) ?? ((data.lists || []) as unknown[]).length,
      lists: ((data.lists || []) as Array<Record<string, unknown>>).map((l) => ({
        listId: l.listId as string,
        name: l.name as string,
        size: l.size as number,
        listType: l.listType as string,
        createdAt: l.createdAt as string,
        updatedAt: l.updatedAt as string,
      })),
    };
  }

  async getList(listId: string) {
    const data = await this.apiGet(`/crm/v3/lists/${listId}`);
    return {
      listId: data.listId,
      name: data.name,
      size: data.size,
      listType: data.listType,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      filterBranch: data.filterBranch,
    };
  }

  async getListMembers(listId: string, limit: number = 100, after?: string) {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (after) params.set("after", after);

    const data = await this.apiGet(
      `/crm/v3/lists/${listId}/memberships?${params.toString()}`,
    );

    return {
      results: data.results || [],
      paging: data.paging,
    };
  }

  // ── Companies ───────────────────────────────────────────

  async searchCompanies(options: SearchOptions) {
    const filterGroups = options.filters?.length
      ? [{ filters: options.filters.map((f) => ({ propertyName: f.propertyName, operator: f.operator, value: f.value })) }]
      : undefined;

    const response = await this.client.crm.companies.searchApi.doSearch({
      query: options.query,
      filterGroups: filterGroups as never, // TYPE: HubSpot SDK expects FilterGroup[] but our shape is compatible
      properties: options.properties,
      limit: options.limit || 10,
      after: options.after ? String(options.after) : undefined,
      sorts: options.sorts as never, // TYPE: HubSpot SDK sort type is overly strict
    });

    return {
      total: response.total,
      results: response.results.map((c) => ({
        id: c.id,
        properties: c.properties,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      paging: response.paging,
    };
  }

  async getCompany(id: string, properties?: string[]) {
    const response = await this.client.crm.companies.basicApi.getById(id, properties);
    return {
      id: response.id,
      properties: response.properties,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    };
  }

  // ── Marketing Emails ────────────────────────────────────

  async listMarketingEmails(limit: number = 50, after?: string) {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (after) params.set("after", after);

    const data = await this.apiGet(
      `/marketing/v3/emails?${params.toString()}`,
    );

    return {
      total: (data.total as number) ?? ((data.results || []) as unknown[]).length,
      results: ((data.results || []) as Array<Record<string, unknown>>).map((e) => ({
        id: e.id as string,
        name: e.name as string,
        subject: e.subject as string,
        type: e.type as string,
        state: e.state as string,
        publishDate: e.publishDate as string,
        createdAt: e.createdAt as string,
        updatedAt: e.updatedAt as string,
        stats: e.statistics,
      })),
      paging: data.paging,
    };
  }

  async getMarketingEmail(emailId: string) {
    const data = await this.apiGet(`/marketing/v3/emails/${emailId}`);
    return data;
  }

  async getMarketingEmailStats(emailId: string) {
    const data = await this.apiGet(
      `/marketing/v3/emails/${emailId}/statistics`,
    );
    return data;
  }

  // ── Workflows (Automation Flows) ─────────────────────────

  async listWorkflows(limit: number = 100, after?: string) {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (after) params.set("after", after);

    const data = await this.apiGet(`/automation/v4/flows?${params.toString()}`);

    return {
      total: (data.total as number) ?? ((data.results || []) as unknown[]).length,
      results: ((data.results || []) as Array<Record<string, unknown>>).map((flow) => ({
        id: flow.id as string,
        name: flow.name as string,
        type: flow.type as string,
        enabled: flow.enabled as boolean,
        insertedAt: flow.insertedAt as string,
        updatedAt: flow.updatedAt as string,
        enrollmentTriggers: flow.enrollmentTriggers,
      })),
      paging: data.paging,
    };
  }

  async getWorkflow(flowId: string) {
    const data = await this.apiGet(`/automation/v4/flows/${flowId}`);
    return data;
  }

  // ── Owners ────────────────────────────────────────────────

  async getOwner(ownerId: string) {
    const response = await this.client.crm.owners.ownersApi.getById(parseInt(ownerId));
    return {
      id: response.id,
      email: response.email,
      firstName: response.firstName,
      lastName: response.lastName,
      userId: response.userId,
      teams: response.teams,
    };
  }
}
