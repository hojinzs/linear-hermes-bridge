export type WorkspaceStrategy = "mkdir";

export type WorkspaceConfig = {
  workspaceRoot: string;
  strategy?: WorkspaceStrategy;
};

export type PrepareWorkspaceInput = {
  workspaceRoot: string;
  agentSlug: string;
  agentId: string;
  organizationId: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
  };
};

export type PrepareWorkspaceResult = {
  workspacePath: string;
  created: boolean;
};
