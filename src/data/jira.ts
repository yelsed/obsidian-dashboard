import { requestUrl, type RequestUrlResponse } from "obsidian";
import { writable, type Readable } from "svelte/store";
import {
  isJiraConnectionConfigured,
  type JiraConnectionSettings,
  type JiraProjectKey,
} from "../settings";

export type JiraAvailability =
  | "not-configured"
  | "checking"
  | "available"
  | "authentication-failed"
  | "errored";

export type JiraIssueSummary = {
  issueKey: string;
  summaryText: string;
  statusName: string;
  statusCategoryKey: string;
  projectKey: JiraProjectKey;
  assigneeDisplayName: string | null;
  priorityName: string | null;
  dueDateIsoString: string | null;
  updatedIsoString: string | null;
  issueBrowserUrl: string;
};

export type JiraSnapshot = {
  jiraAvailability: JiraAvailability;
  issues: JiraIssueSummary[];
  lastErrorMessage: string | null;
  lastRefreshedAtEpochMilliseconds: number | null;
};

export type JiraIssuesStore = {
  store: Readable<JiraSnapshot>;
  setConnectionSettings: (connection: JiraConnectionSettings) => void;
  setProjectKeysToQuery: (projectKeys: JiraProjectKey[]) => void;
  refreshNow: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  destroy: () => void;
};

export type JiraConnectionTestResult =
  | { outcome: "succeeded"; accountDisplayName: string }
  | { outcome: "not-configured" }
  | { outcome: "authentication-failed" }
  | { outcome: "errored"; message: string };

const JIRA_POLLING_INTERVAL_MILLISECONDS = 300_000;
const JIRA_MAXIMUM_ISSUES_PER_QUERY = 50;
const JIRA_SEARCH_FIELDS = [
  "summary",
  "status",
  "priority",
  "duedate",
  "assignee",
  "project",
  "updated",
];

const NOT_CONFIGURED_SNAPSHOT: JiraSnapshot = {
  jiraAvailability: "not-configured",
  issues: [],
  lastErrorMessage: null,
  lastRefreshedAtEpochMilliseconds: null,
};

export function createJiraIssuesStore(): JiraIssuesStore {
  let currentConnection: JiraConnectionSettings = {
    siteDomain: "",
    accountEmail: "",
    apiToken: "",
    showOnlyIssuesAssignedToCurrentUser: true,
  };
  let currentProjectKeysToQuery: JiraProjectKey[] = [];

  const snapshotStore = writable<JiraSnapshot>(NOT_CONFIGURED_SNAPSHOT);
  let pollingIntervalHandle: ReturnType<typeof setInterval> | null = null;
  let isRefreshInFlight = false;
  let mostRecentlyPublishedAvailability: JiraAvailability = "not-configured";

  function publishSnapshot(snapshot: JiraSnapshot): void {
    mostRecentlyPublishedAvailability = snapshot.jiraAvailability;
    snapshotStore.set(snapshot);
  }

  async function refreshJiraIssuesOnce(): Promise<void> {
    if (isRefreshInFlight) {
      return;
    }
    const projectKeysToQuery = currentProjectKeysToQuery
      .map((projectKey) => projectKey.trim())
      .filter((projectKey) => projectKey.length > 0);
    if (!isJiraConnectionConfigured(currentConnection) || projectKeysToQuery.length === 0) {
      publishSnapshot(NOT_CONFIGURED_SNAPSHOT);
      return;
    }
    isRefreshInFlight = true;
    try {
      // Show the loading state only when nothing valid is on screen yet, so a
      // background poll never blanks out issues the user is already reading.
      if (mostRecentlyPublishedAvailability !== "available") {
        publishSnapshot({
          jiraAvailability: "checking",
          issues: [],
          lastErrorMessage: null,
          lastRefreshedAtEpochMilliseconds: null,
        });
      }
      const nextSnapshot = await fetchJiraIssuesSnapshot(currentConnection, projectKeysToQuery);
      publishSnapshot(nextSnapshot);
    } finally {
      isRefreshInFlight = false;
    }
  }

  function setConnectionSettings(connection: JiraConnectionSettings): void {
    currentConnection = connection;
    void refreshJiraIssuesOnce();
  }

  function setProjectKeysToQuery(projectKeys: JiraProjectKey[]): void {
    currentProjectKeysToQuery = projectKeys;
    void refreshJiraIssuesOnce();
  }

  function refreshNow(): void {
    void refreshJiraIssuesOnce();
  }

  function startPolling(): void {
    if (pollingIntervalHandle !== null) {
      return;
    }
    void refreshJiraIssuesOnce();
    pollingIntervalHandle = setInterval(() => {
      void refreshJiraIssuesOnce();
    }, JIRA_POLLING_INTERVAL_MILLISECONDS);
  }

  function stopPolling(): void {
    if (pollingIntervalHandle === null) {
      return;
    }
    clearInterval(pollingIntervalHandle);
    pollingIntervalHandle = null;
  }

  function destroy(): void {
    stopPolling();
  }

  return {
    store: snapshotStore,
    setConnectionSettings,
    setProjectKeysToQuery,
    refreshNow,
    startPolling,
    stopPolling,
    destroy,
  };
}

export type JiraIssueComment = {
  authorDisplayName: string;
  bodyText: string;
};

export type JiraIssueDetail = {
  issueKey: string;
  summaryText: string;
  issueTypeName: string | null;
  statusName: string;
  priorityName: string | null;
  labels: string[];
  assigneeDisplayName: string | null;
  reporterDisplayName: string | null;
  descriptionText: string;
  comments: JiraIssueComment[];
  issueBrowserUrl: string;
};

export type JiraIssueDetailResult =
  | { ok: true; issue: JiraIssueDetail }
  | { ok: false; message: string };

const JIRA_ISSUE_DETAIL_FIELDS = [
  "summary",
  "description",
  "status",
  "priority",
  "issuetype",
  "labels",
  "assignee",
  "reporter",
  "comment",
];
const JIRA_MAXIMUM_COMMENTS_IN_PROMPT = 5;

export async function fetchJiraIssueDetail(
  connection: JiraConnectionSettings,
  issueKey: string,
): Promise<JiraIssueDetailResult> {
  if (!isJiraConnectionConfigured(connection)) {
    return { ok: false, message: "Jira connection is not configured" };
  }

  const siteDomain = connection.siteDomain.trim();
  const queryParameters = new URLSearchParams({
    fields: JIRA_ISSUE_DETAIL_FIELDS.join(","),
  });

  let response: RequestUrlResponse;
  try {
    response = await requestUrl({
      url: `https://${siteDomain}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${queryParameters.toString()}`,
      method: "GET",
      headers: {
        Authorization: buildBasicAuthorizationHeader(connection),
        Accept: "application/json",
      },
      throw: false,
    });
  } catch (caughtError) {
    return { ok: false, message: describeCaughtError(caughtError) };
  }

  if (!responseStatusIndicatesSuccess(response.status)) {
    return { ok: false, message: describeUnsuccessfulResponse(response) };
  }

  const issueRecord = readJsonObject(response);
  if (issueRecord === null) {
    return { ok: false, message: "Jira returned an unreadable response" };
  }
  return { ok: true, issue: parseJiraIssueDetail(issueRecord, issueKey, siteDomain) };
}

export function buildClaudePromptForJiraIssue(issue: JiraIssueDetail): string {
  const metadataLine = [
    issue.issueTypeName ? `Type: ${issue.issueTypeName}` : null,
    `Status: ${issue.statusName}`,
    issue.priorityName ? `Priority: ${issue.priorityName}` : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join(" · ");

  const sections: string[] = [
    "I need to work on this Jira ticket. Here are the full details.",
    `Ticket ${issue.issueKey}: ${issue.summaryText}`,
    metadataLine,
  ];

  if (issue.labels.length > 0) {
    sections.push(`Labels: ${issue.labels.join(", ")}`);
  }

  const peopleLine = [
    issue.assigneeDisplayName ? `Assignee: ${issue.assigneeDisplayName}` : null,
    issue.reporterDisplayName ? `Reporter: ${issue.reporterDisplayName}` : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join(" · ");
  if (peopleLine.length > 0) {
    sections.push(peopleLine);
  }

  sections.push(`URL: ${issue.issueBrowserUrl}`);

  if (issue.descriptionText.trim().length > 0) {
    sections.push(`Description:\n${issue.descriptionText.trim()}`);
  }

  if (issue.comments.length > 0) {
    const renderedComments = issue.comments
      .map((comment) => `[${comment.authorDisplayName}] ${comment.bodyText.trim()}`)
      .join("\n\n");
    sections.push(`Comments:\n${renderedComments}`);
  }

  sections.push(
    "Please analyse this ticket against the code in this folder, then implement a fix. " +
      "Ask me before making large or ambiguous changes.",
  );

  return sections.join("\n\n");
}

function parseJiraIssueDetail(
  issueRecord: Record<string, unknown>,
  issueKey: string,
  siteDomain: string,
): JiraIssueDetail {
  const fieldsRecord = asRecordOrEmpty(issueRecord.fields);
  const statusRecord = asRecordOrEmpty(fieldsRecord.status);
  const priorityRecord = asRecordOrEmpty(fieldsRecord.priority);
  const issueTypeRecord = asRecordOrEmpty(fieldsRecord.issuetype);
  const assigneeRecord = asRecordOrEmpty(fieldsRecord.assignee);
  const reporterRecord = asRecordOrEmpty(fieldsRecord.reporter);

  return {
    issueKey,
    summaryText: typeof fieldsRecord.summary === "string" ? fieldsRecord.summary : "",
    issueTypeName: typeof issueTypeRecord.name === "string" ? issueTypeRecord.name : null,
    statusName: typeof statusRecord.name === "string" ? statusRecord.name : "",
    priorityName: typeof priorityRecord.name === "string" ? priorityRecord.name : null,
    labels: Array.isArray(fieldsRecord.labels)
      ? fieldsRecord.labels.filter((label): label is string => typeof label === "string")
      : [],
    assigneeDisplayName:
      typeof assigneeRecord.displayName === "string" ? assigneeRecord.displayName : null,
    reporterDisplayName:
      typeof reporterRecord.displayName === "string" ? reporterRecord.displayName : null,
    descriptionText: flattenJiraRichTextValue(fieldsRecord.description),
    comments: parseJiraComments(fieldsRecord.comment),
    issueBrowserUrl: `https://${siteDomain}/browse/${issueKey}`,
  };
}

function parseJiraComments(rawCommentField: unknown): JiraIssueComment[] {
  const commentFieldRecord = asRecordOrEmpty(rawCommentField);
  if (!Array.isArray(commentFieldRecord.comments)) {
    return [];
  }
  const mostRecentComments = commentFieldRecord.comments.slice(
    -JIRA_MAXIMUM_COMMENTS_IN_PROMPT,
  );
  return mostRecentComments.map((rawComment) => {
    const commentRecord = asRecordOrEmpty(rawComment);
    const authorRecord = asRecordOrEmpty(commentRecord.author);
    return {
      authorDisplayName:
        typeof authorRecord.displayName === "string" ? authorRecord.displayName : "Unknown",
      bodyText: flattenJiraRichTextValue(commentRecord.body),
    };
  });
}

// Jira Cloud rich text (description, comment bodies) arrives as an Atlassian
// Document Format tree, not plain text. This flattens it to readable text for
// the Claude prompt. A plain string is returned as-is for older payloads.
function flattenJiraRichTextValue(richTextValue: unknown): string {
  if (typeof richTextValue === "string") {
    return richTextValue;
  }
  if (richTextValue === null || typeof richTextValue !== "object") {
    return "";
  }
  return flattenAtlassianDocumentNode(richTextValue, 0).replace(/\n{3,}/g, "\n\n").trim();
}

const ATLASSIAN_DOCUMENT_MAXIMUM_DEPTH = 60;

function flattenAtlassianDocumentNode(documentNode: unknown, currentDepth: number): string {
  if (currentDepth > ATLASSIAN_DOCUMENT_MAXIMUM_DEPTH) {
    return "";
  }
  if (documentNode === null || typeof documentNode !== "object") {
    return "";
  }
  const node = documentNode as Record<string, unknown>;
  const nodeType = typeof node.type === "string" ? node.type : "";
  const childNodes = Array.isArray(node.content) ? node.content : [];

  switch (nodeType) {
    case "text":
      return typeof node.text === "string" ? node.text : "";
    case "hardBreak":
      return "\n";
    case "paragraph":
      return `${flattenAtlassianDocumentChildren(childNodes, currentDepth)}\n`;
    case "heading":
      return `${"#".repeat(readAtlassianHeadingLevel(node))} ${flattenAtlassianDocumentChildren(childNodes, currentDepth)}\n`;
    case "bulletList":
      return `${childNodes.map((listItem) => `- ${flattenAtlassianDocumentNode(listItem, currentDepth + 1).trim()}`).join("\n")}\n`;
    case "orderedList":
      return `${childNodes.map((listItem, listItemIndex) => `${listItemIndex + 1}. ${flattenAtlassianDocumentNode(listItem, currentDepth + 1).trim()}`).join("\n")}\n`;
    case "codeBlock":
      return `\`\`\`\n${flattenAtlassianDocumentChildren(childNodes, currentDepth)}\n\`\`\`\n`;
    case "rule":
      return "---\n";
    default:
      return flattenAtlassianDocumentChildren(childNodes, currentDepth);
  }
}

function flattenAtlassianDocumentChildren(childNodes: unknown[], currentDepth: number): string {
  return childNodes
    .map((childNode) => flattenAtlassianDocumentNode(childNode, currentDepth + 1))
    .join("");
}

function readAtlassianHeadingLevel(headingNode: Record<string, unknown>): number {
  const attributesRecord = asRecordOrEmpty(headingNode.attrs);
  const level =
    typeof attributesRecord.level === "number" && Number.isFinite(attributesRecord.level)
      ? attributesRecord.level
      : 1;
  return Math.min(Math.max(level, 1), 6);
}

export async function testJiraConnection(
  connection: JiraConnectionSettings,
): Promise<JiraConnectionTestResult> {
  if (!isJiraConnectionConfigured(connection)) {
    return { outcome: "not-configured" };
  }

  let response: RequestUrlResponse;
  try {
    response = await requestUrl({
      url: `https://${connection.siteDomain.trim()}/rest/api/3/myself`,
      method: "GET",
      headers: {
        Authorization: buildBasicAuthorizationHeader(connection),
        Accept: "application/json",
      },
      throw: false,
    });
  } catch (caughtError) {
    return { outcome: "errored", message: describeCaughtError(caughtError) };
  }

  if (responseStatusIndicatesAuthenticationFailure(response.status)) {
    return { outcome: "authentication-failed" };
  }
  if (!responseStatusIndicatesSuccess(response.status)) {
    return { outcome: "errored", message: describeUnsuccessfulResponse(response) };
  }

  const accountRecord = readJsonObject(response);
  const accountDisplayName =
    accountRecord !== null && typeof accountRecord.displayName === "string"
      ? accountRecord.displayName
      : "your Jira account";
  return { outcome: "succeeded", accountDisplayName };
}

async function fetchJiraIssuesSnapshot(
  connection: JiraConnectionSettings,
  projectKeys: JiraProjectKey[],
): Promise<JiraSnapshot> {
  const jiraQueryLanguageString = buildJiraQueryLanguageString(
    projectKeys,
    connection.showOnlyIssuesAssignedToCurrentUser,
  );

  let response: RequestUrlResponse;
  try {
    response = await requestUrl({
      // requestUrl runs outside the browser fetch sandbox, so it reaches Jira
      // Cloud without a CORS preflight. It must be a GET, not a POST: Electron
      // attaches an Origin header that Jira Cloud's edge rejects with 403 on
      // POST, while GET (the same shape as /myself) is accepted. /search/jql is
      // the current enhanced JQL search; legacy GET/POST /search is being removed.
      url: buildJiraSearchUrl(connection.siteDomain.trim(), jiraQueryLanguageString),
      method: "GET",
      headers: {
        Authorization: buildBasicAuthorizationHeader(connection),
        Accept: "application/json",
      },
      throw: false,
    });
  } catch (caughtError) {
    return buildErroredSnapshot(describeCaughtError(caughtError));
  }

  if (responseStatusIndicatesAuthenticationFailure(response.status)) {
    return {
      jiraAvailability: "authentication-failed",
      issues: [],
      lastErrorMessage: describeUnsuccessfulResponse(response),
      lastRefreshedAtEpochMilliseconds: Date.now(),
    };
  }
  if (!responseStatusIndicatesSuccess(response.status)) {
    return buildErroredSnapshot(describeUnsuccessfulResponse(response));
  }

  const issues = parseJiraIssuesFromResponse(response, connection.siteDomain.trim());
  return {
    jiraAvailability: "available",
    issues,
    lastErrorMessage: null,
    lastRefreshedAtEpochMilliseconds: Date.now(),
  };
}

function buildJiraSearchUrl(siteDomain: string, jiraQueryLanguageString: string): string {
  const queryParameters = new URLSearchParams({
    jql: jiraQueryLanguageString,
    fields: JIRA_SEARCH_FIELDS.join(","),
    maxResults: String(JIRA_MAXIMUM_ISSUES_PER_QUERY),
  });
  return `https://${siteDomain}/rest/api/3/search/jql?${queryParameters.toString()}`;
}

function buildJiraQueryLanguageString(
  trimmedNonEmptyProjectKeys: JiraProjectKey[],
  showOnlyIssuesAssignedToCurrentUser: boolean,
): string {
  const quotedProjectKeys = trimmedNonEmptyProjectKeys
    .map((projectKey) => `"${projectKey}"`)
    .join(", ");

  const assigneeClause = showOnlyIssuesAssignedToCurrentUser
    ? " AND assignee = currentUser()"
    : "";

  return `project IN (${quotedProjectKeys}) AND statusCategory != Done${assigneeClause} ORDER BY updated DESC`;
}

function buildBasicAuthorizationHeader(connection: JiraConnectionSettings): string {
  const credentialPair = `${connection.accountEmail.trim()}:${connection.apiToken}`;
  return `Basic ${Buffer.from(credentialPair).toString("base64")}`;
}

function parseJiraIssuesFromResponse(
  response: RequestUrlResponse,
  siteDomain: string,
): JiraIssueSummary[] {
  const responseRecord = readJsonObject(response);
  if (responseRecord === null || !Array.isArray(responseRecord.issues)) {
    return [];
  }

  const parsedIssues: JiraIssueSummary[] = [];
  for (const rawIssue of responseRecord.issues) {
    const parsedIssue = parseOneJiraIssue(rawIssue, siteDomain);
    if (parsedIssue !== null) {
      parsedIssues.push(parsedIssue);
    }
  }
  return parsedIssues;
}

function parseOneJiraIssue(rawIssue: unknown, siteDomain: string): JiraIssueSummary | null {
  if (rawIssue === null || typeof rawIssue !== "object") {
    return null;
  }
  const issueRecord = rawIssue as Record<string, unknown>;
  const issueKey = typeof issueRecord.key === "string" ? issueRecord.key : "";
  if (issueKey.length === 0) {
    return null;
  }

  const fieldsRecord = asRecordOrEmpty(issueRecord.fields);
  const statusRecord = asRecordOrEmpty(fieldsRecord.status);
  const statusCategoryRecord = asRecordOrEmpty(statusRecord.statusCategory);
  const priorityRecord = asRecordOrEmpty(fieldsRecord.priority);
  const assigneeRecord = asRecordOrEmpty(fieldsRecord.assignee);
  const projectRecord = asRecordOrEmpty(fieldsRecord.project);

  return {
    issueKey,
    summaryText: typeof fieldsRecord.summary === "string" ? fieldsRecord.summary : "",
    statusName: typeof statusRecord.name === "string" ? statusRecord.name : "",
    statusCategoryKey:
      typeof statusCategoryRecord.key === "string" ? statusCategoryRecord.key : "",
    projectKey: typeof projectRecord.key === "string" ? projectRecord.key : "",
    assigneeDisplayName:
      typeof assigneeRecord.displayName === "string" ? assigneeRecord.displayName : null,
    priorityName: typeof priorityRecord.name === "string" ? priorityRecord.name : null,
    dueDateIsoString: typeof fieldsRecord.duedate === "string" ? fieldsRecord.duedate : null,
    updatedIsoString: typeof fieldsRecord.updated === "string" ? fieldsRecord.updated : null,
    issueBrowserUrl: `https://${siteDomain}/browse/${issueKey}`,
  };
}

function buildErroredSnapshot(errorMessage: string): JiraSnapshot {
  return {
    jiraAvailability: "errored",
    issues: [],
    lastErrorMessage: errorMessage,
    lastRefreshedAtEpochMilliseconds: Date.now(),
  };
}

function responseStatusIndicatesSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function responseStatusIndicatesAuthenticationFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function describeUnsuccessfulResponse(response: RequestUrlResponse): string {
  const responseRecord = readJsonObject(response);
  if (responseRecord !== null && Array.isArray(responseRecord.errorMessages)) {
    const joinedErrorMessages = responseRecord.errorMessages
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ");
    if (joinedErrorMessages.length > 0) {
      return `HTTP ${response.status}: ${joinedErrorMessages}`;
    }
  }
  if (typeof responseRecord?.message === "string" && responseRecord.message.length > 0) {
    return `HTTP ${response.status}: ${responseRecord.message}`;
  }
  return `Jira responded with HTTP ${response.status}`;
}

function describeCaughtError(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

function readJsonObject(response: RequestUrlResponse): Record<string, unknown> | null {
  try {
    const parsedJson = response.json;
    if (parsedJson !== null && typeof parsedJson === "object") {
      return parsedJson as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function asRecordOrEmpty(candidateValue: unknown): Record<string, unknown> {
  if (candidateValue !== null && typeof candidateValue === "object") {
    return candidateValue as Record<string, unknown>;
  }
  return {};
}
