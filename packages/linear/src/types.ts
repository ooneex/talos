import type { Issue } from "./Issue";

export type LinearConfigType = {
  apiKey?: string;
  teamId?: string;
};

export type LinearLabelType = {
  id?: string;
  name?: string;
  color?: string;
  description?: string;
  teamId?: string;
};

export type LinearTeamType = {
  id: string;
  name: string;
  key: string;
};

export type LinearProjectType = {
  id: string;
  name: string;
  description?: string;
  url: string;
};

export type LinearUserType = {
  id: string;
  name: string;
  email: string;
  displayName: string;
};

export type LinearStateType = {
  id?: string;
  name?: string;
  color?: string;
  type?: string;
  description?: string;
  position?: number;
  teamId?: string;
};

export type LinearCommentType = {
  id: string;
  body: string;
  createdAt: Date;
  user?: LinearUserType;
};

export type LinearPriorityType = {
  value: number;
  label: string;
};

export interface ILinearService {
  getIssue: (id: string) => Promise<Issue>;
  getIssues: (teamId: string, filters?: Record<string, unknown>) => Promise<Issue[]>;
  createIssue: (input: Issue) => Promise<Issue>;
  updateIssue: (id: string, input: Issue) => Promise<Issue>;
  deleteIssue: (id: string) => Promise<boolean>;
  getTeams: () => Promise<LinearTeamType[]>;
  getProjects: (teamId?: string) => Promise<LinearProjectType[]>;
  getViewer: () => Promise<LinearUserType>;
  getLabel: (id: string) => Promise<LinearLabelType>;
  getLabels: (teamId?: string) => Promise<LinearLabelType[]>;
  createLabel: (input: LinearLabelType) => Promise<LinearLabelType>;
  updateLabel: (id: string, input: LinearLabelType) => Promise<LinearLabelType>;
  deleteLabel: (id: string) => Promise<boolean>;
  getPriorities: () => LinearPriorityType[];
  getPriority: (issueId: string) => Promise<LinearPriorityType>;
  setPriority: (issueId: string, priority: number) => Promise<Issue>;
  clearPriority: (issueId: string) => Promise<Issue>;
  getState: (id: string) => Promise<LinearStateType>;
  getStates: (teamId?: string) => Promise<LinearStateType[]>;
  createState: (input: LinearStateType) => Promise<LinearStateType>;
  updateState: (id: string, input: LinearStateType) => Promise<LinearStateType>;
  deleteState: (id: string) => Promise<boolean>;
  checkLabelById: (id: string) => Promise<boolean>;
  checkLabelByName: (name: string, teamId?: string) => Promise<boolean>;
  checkPriorityById: (value: number) => boolean;
  checkPriorityByName: (name: string) => boolean;
  checkStateById: (id: string) => Promise<boolean>;
  checkStateByName: (name: string, teamId?: string) => Promise<boolean>;
  createComment: (issueId: string, body: string) => Promise<LinearCommentType>;
}
