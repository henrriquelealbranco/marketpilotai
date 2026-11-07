-- Remote AI execution is serialized per workspace, including concurrent API processes.
CREATE UNIQUE INDEX "AgentRun_one_openai_running_per_workspace"
ON "AgentRun" ("workspaceId") WHERE "provider" = 'openai' AND "status" = 'RUNNING';
