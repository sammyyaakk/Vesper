// Mirrors the server's rule for editing task details (the server still enforces it): the project lead or a workspace admin
export const canManageProject = (project, userId, workspaceRole) => Boolean(project && userId && (workspaceRole === "ADMIN" || project.teamLead === userId));
