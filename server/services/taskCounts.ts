import prisma from "../configs/prisma.js";

export interface TaskCounts {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
}

const empty = (): TaskCounts => ({ total: 0, todo: 0, inProgress: 0, done: 0 });

// One GROUP BY query for any number of projects
export const taskCountsByProject = async (projectIds: string[]) => {
    const rows = await prisma.task.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
    });

    const counts = new Map(projectIds.map((id) => [id, empty()]));
    for (const row of rows) {
        const entry = counts.get(row.projectId)!;
        const n = row._count._all;
        entry.total += n;
        if (row.status === "TODO") entry.todo += n;
        else if (row.status === "IN_PROGRESS") entry.inProgress += n;
        else entry.done += n;
    }
    return counts;
};
