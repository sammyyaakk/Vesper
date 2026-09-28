export const getProjectProgress = (taskCounts) => {
    if (!taskCounts?.total) return 0;
    return Math.round((taskCounts.done / taskCounts.total) * 100);
};
