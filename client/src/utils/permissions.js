// Mirror the server's rules so the UI only offers what will succeed; the server still enforces them.
// The named lead is always a LEAD; workspace admins can manage every project.
export const projectRoleOf = (project, userId) =>
    !project || !userId ? null : project.teamLead === userId ? "LEAD" : (project.members?.find((member) => (member.userId ?? member.user?.id) === userId)?.role ?? null);

export const canManageProject = (project, userId, workspaceRole) =>
    Boolean(project && userId && (workspaceRole === "ADMIN" || projectRoleOf(project, userId) === "LEAD"));

// Viewers read and comment; leads, contributors and admins work on tasks
export const canContribute = (project, userId, workspaceRole) =>
    canManageProject(project, userId, workspaceRole) || projectRoleOf(project, userId) === "CONTRIBUTOR";

export const PROJECT_ROLES = ["LEAD", "CONTRIBUTOR", "VIEWER"];
