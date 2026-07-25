import type {
  JiraIssueParentSummary,
  JiraIssueSummary,
  JiraSprintSummary,
} from "../data/jira";

export type JiraHierarchySubtaskGroup = {
  parentIssue: JiraIssueParentSummary | null;
  subtasks: JiraIssueSummary[];
};

export type JiraHierarchyTaskNode = {
  taskIssue: JiraIssueSummary | null;
  parentIssue: JiraIssueParentSummary | null;
  subtasks: JiraIssueSummary[];
};

export type JiraHierarchyEpicGroup = {
  epicKey: string;
  epicSummaryText: string | null;
  epicIssue: JiraIssueSummary | null;
  tasks: JiraHierarchyTaskNode[];
  orphanSubtaskGroups: JiraHierarchySubtaskGroup[];
};

export type JiraHierarchySprintGroup = {
  sprintKey: string;
  sprintName: string;
  sprintState: string | null;
  epicGroups: JiraHierarchyEpicGroup[];
};

type MutableJiraHierarchyEpicGroup = JiraHierarchyEpicGroup & {
  orphanSubtaskGroupByParentKey: Map<string, JiraHierarchySubtaskGroup>;
};

type MutableJiraHierarchySprintGroup = JiraHierarchySprintGroup & {
  epicGroupByKey: Map<string, MutableJiraHierarchyEpicGroup>;
  sprintStartDateIsoString: string | null;
  sprintEndDateIsoString: string | null;
  sprintCompleteDateIsoString: string | null;
  firstSeenIssueIndex: number;
};

export function buildJiraSprintEpicHierarchy(
  issues: JiraIssueSummary[],
): JiraHierarchySprintGroup[] {
  const issuesInJiraOrder = issues;
  const sprintGroups: MutableJiraHierarchySprintGroup[] = [];
  const sprintGroupByKey = new Map<string, MutableJiraHierarchySprintGroup>();
  const taskNodeByIssueKey = new Map<string, JiraHierarchyTaskNode>();

  for (let issueIndex = 0; issueIndex < issuesInJiraOrder.length; issueIndex += 1) {
    ensureEpicGroupForIssue(issuesInJiraOrder[issueIndex], issueIndex, sprintGroups, sprintGroupByKey);
  }

  for (const issue of issuesInJiraOrder) {
    if (isJiraEpicIssue(issue) || issue.issueTypeIsSubtask) {
      continue;
    }
    const epicGroup = ensureEpicGroupForIssue(issue, issuesInJiraOrder.indexOf(issue), sprintGroups, sprintGroupByKey);
    const taskNode: JiraHierarchyTaskNode = {
      taskIssue: issue,
      parentIssue: issue.parentIssue,
      subtasks: [],
    };
    epicGroup.tasks.push(taskNode);
    taskNodeByIssueKey.set(issue.issueKey, taskNode);
  }

  for (const issue of issuesInJiraOrder) {
    if (!isJiraEpicIssue(issue)) {
      continue;
    }
    const epicGroup = ensureEpicGroupForIssue(issue, issuesInJiraOrder.indexOf(issue), sprintGroups, sprintGroupByKey);
    epicGroup.epicIssue = issue;
    epicGroup.epicSummaryText = issue.summaryText;
  }

  for (const issue of issuesInJiraOrder) {
    if (!issue.issueTypeIsSubtask) {
      continue;
    }
    const parentTaskNode = taskNodeByIssueKey.get(issue.parentIssue?.issueKey ?? "");
    if (parentTaskNode !== undefined) {
      parentTaskNode.subtasks.push(issue);
      continue;
    }

    const epicGroup = ensureEpicGroupForIssue(issue, issuesInJiraOrder.indexOf(issue), sprintGroups, sprintGroupByKey);
    const parentGroupKey = issue.parentIssue?.issueKey ?? "no-parent";
    let subtaskGroup = epicGroup.orphanSubtaskGroupByParentKey.get(parentGroupKey);
    if (subtaskGroup === undefined) {
      subtaskGroup = {
        parentIssue: issue.parentIssue,
        subtasks: [],
      };
      epicGroup.orphanSubtaskGroupByParentKey.set(parentGroupKey, subtaskGroup);
      epicGroup.orphanSubtaskGroups.push(subtaskGroup);
    }
    subtaskGroup.subtasks.push(issue);
  }

  return [...sprintGroups].sort(compareSprintGroupsByDate);
}


function chooseDisplaySprint(sprints: JiraSprintSummary[]): JiraSprintSummary | null {
  return (
    sprints.find((sprint) => sprint.sprintState?.toLowerCase() === "active") ??
    sprints.find((sprint) => sprint.sprintState?.toLowerCase() === "future") ??
    sprints.find((sprint) => sprint.sprintState?.toLowerCase() === "closed") ??
    sprints[0] ??
    null
  );
}

function isJiraEpicIssue(issue: JiraIssueSummary): boolean {
  return (
    issue.issueTypeName?.toLowerCase() === "epic" ||
    (issue.issueTypeHierarchyLevel !== null && issue.issueTypeHierarchyLevel > 0)
  );
}

function compareSprintGroupsByDate(
  leftGroup: MutableJiraHierarchySprintGroup,
  rightGroup: MutableJiraHierarchySprintGroup,
): number {
  if (leftGroup.sprintKey === "no-sprint" && rightGroup.sprintKey !== "no-sprint") {
    return 1;
  }
  if (rightGroup.sprintKey === "no-sprint" && leftGroup.sprintKey !== "no-sprint") {
    return -1;
  }
  const dateComparison = compareNullableStringsAscending(
    readSprintSortDate(leftGroup),
    readSprintSortDate(rightGroup),
  );
  if (dateComparison !== 0) {
    return dateComparison;
  }
  return leftGroup.firstSeenIssueIndex - rightGroup.firstSeenIssueIndex;
}

function readSprintSortDate(sprintGroup: MutableJiraHierarchySprintGroup): string | null {
  return (
    sprintGroup.sprintStartDateIsoString ??
    sprintGroup.sprintEndDateIsoString ??
    sprintGroup.sprintCompleteDateIsoString
  );
}

function compareNullableStringsAscending(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function ensureEpicGroupForIssue(
  issue: JiraIssueSummary,
  issueIndex: number,
  sprintGroups: MutableJiraHierarchySprintGroup[],
  sprintGroupByKey: Map<string, MutableJiraHierarchySprintGroup>,
): MutableJiraHierarchyEpicGroup {
  const sprint = chooseDisplaySprint(issue.sprints);
  const sprintKey = sprint === null ? "no-sprint" : `sprint:${sprint.sprintId}`;
  let sprintGroup = sprintGroupByKey.get(sprintKey);
  if (sprintGroup === undefined) {
    sprintGroup = {
      sprintKey,
      sprintName: sprint?.sprintName ?? "No sprint",
      sprintState: sprint?.sprintState ?? null,
      epicGroups: [],
      sprintStartDateIsoString: sprint?.startDateIsoString ?? null,
      sprintEndDateIsoString: sprint?.endDateIsoString ?? null,
      sprintCompleteDateIsoString: sprint?.completeDateIsoString ?? null,
      firstSeenIssueIndex: issueIndex,
      epicGroupByKey: new Map(),
    };
    sprintGroupByKey.set(sprintKey, sprintGroup);
    sprintGroups.push(sprintGroup);
  }

  const epicKey = readEpicGroupKeyForIssue(issue);
  let epicGroup = sprintGroup.epicGroupByKey.get(epicKey);
  if (epicGroup === undefined) {
    epicGroup = {
      epicKey,
      epicSummaryText: readEpicSummaryTextForIssue(issue),
      epicIssue: isJiraEpicIssue(issue) ? issue : null,
      tasks: [],
      orphanSubtaskGroups: [],
      orphanSubtaskGroupByParentKey: new Map(),
    };
    sprintGroup.epicGroupByKey.set(epicKey, epicGroup);
    sprintGroup.epicGroups.push(epicGroup);
  } else if (epicGroup.epicSummaryText === null) {
    epicGroup.epicSummaryText = readEpicSummaryTextForIssue(issue);
  }
  return epicGroup;
}

function readEpicGroupKeyForIssue(issue: JiraIssueSummary): string {
  if (isJiraEpicIssue(issue)) {
    return `epic:${issue.issueKey}`;
  }
  return issue.epicIssueKey === null ? "no-epic" : `epic:${issue.epicIssueKey}`;
}

function readEpicSummaryTextForIssue(issue: JiraIssueSummary): string | null {
  if (isJiraEpicIssue(issue)) {
    return issue.summaryText;
  }
  if (issue.parentIssue?.issueKey === issue.epicIssueKey) {
    return issue.parentIssue.summaryText;
  }
  return null;
}

