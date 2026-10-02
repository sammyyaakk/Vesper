import { emitWorkspaceChanged } from "../realtime/index.js";
import { invalidateWorkspace } from "./workspaceCache.js";

// Every write that can change what a workspace's members see ends here: the cached views are invalidated, then members
// with the app open are told to refetch. One choke point, so a new write path can't forget either step.
export const workspaceChanged = async (...workspaceIds: string[]) => {
    await invalidateWorkspace(...workspaceIds);
    for (const workspaceId of new Set(workspaceIds)) emitWorkspaceChanged(workspaceId);
};
