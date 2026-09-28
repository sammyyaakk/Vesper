import api from "../configs/api";
import toast from "react-hot-toast";
import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useSelector } from "react-redux";
import { authHeaders } from "../features/workspaceSlice";
import { Bug, CalendarIcon, GitCommit, MessageSquare, Square, Trash, XIcon, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TaskActionsMenu from "./TaskActionsMenu";
import TaskFormDialog from "./TaskFormDialog";
import { canManageProject } from "../utils/permissions";
import { useProjectRoom } from "../realtime/useProjectRoom";

const typeIcons = {
    BUG: { icon: Bug, color: "text-red-600 dark:text-red-400" },
    FEATURE: { icon: Zap, color: "text-blue-600 dark:text-blue-400" },
    TASK: { icon: Square, color: "text-green-600 dark:text-green-400" },
    IMPROVEMENT: { icon: GitCommit, color: "text-purple-600 dark:text-purple-400" },
    OTHER: { icon: MessageSquare, color: "text-amber-600 dark:text-amber-400" },
};

const priorityTexts = {
    LOW: { background: "bg-red-100 dark:bg-red-950", prioritycolor: "text-red-600 dark:text-red-400" },
    MEDIUM: { background: "bg-blue-100 dark:bg-blue-950", prioritycolor: "text-blue-600 dark:text-blue-400" },
    HIGH: { background: "bg-emerald-100 dark:bg-emerald-950", prioritycolor: "text-emerald-600 dark:text-emerald-400" },
};

const PAGE_SIZE = 50;

const ProjectTasks = ({ projectId, reloadKey, onChanged }) => {
    const { getToken } = useAuth();
    const { user } = useUser();
    const navigate = useNavigate();
    const [selectedTasks, setSelectedTasks] = useState([]);

    const [filters, setFilters] = useState({
        status: "",
        type: "",
        priority: "",
        assignee: "",
    });

    const [tasks, setTasks] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const project = useSelector((state) => state.workspace.projects.find((p) => p.id === projectId));
    const workspaceRole = useSelector((state) => state.workspace.currentWorkspace?.role);
    const members = project?.members ?? [];
    const canManage = canManageProject(project, user?.id, workspaceRole);
    const [editingTask, setEditingTask] = useState(null);

    // Filters run on the server; only non-empty ones are sent
    const fetchPage = useCallback(
        async (cursor) => {
            const params = Object.fromEntries(Object.entries({ ...filters, cursor, limit: PAGE_SIZE }).filter(([, value]) => value));
            const { data } = await api.get(`/api/projects/${projectId}/tasks`, { ...(await authHeaders(getToken)), params });
            return data;
        },
        [projectId, filters, getToken]
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchPage()
            .then((data) => {
                if (cancelled) return;
                setTasks(data.tasks);
                setNextCursor(data.nextCursor);
            })
            .catch((error) => toast.error(error?.response?.data?.message || error.message))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [fetchPage, reloadKey]);

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const data = await fetchPage(nextCursor);
            setTasks((prev) => [...prev, ...data.tasks]);
            setNextCursor(data.nextCursor);
        } catch (error) {
            toast.error(error?.response?.data?.message || error.message);
        } finally {
            setLoadingMore(false);
        }
    };

    const reloadFirstPage = useCallback(async () => {
        try {
            const data = await fetchPage();
            setTasks(data.tasks);
            setNextCursor(data.nextCursor);
        } catch {
            // the next change or reconnect tries again
        }
    }, [fetchPage]);

    // Other people's changes also move the project's counts; a burst of events refreshes them once
    const changedTimer = useRef(null);
    const onChangedSoon = () => {
        clearTimeout(changedTimer.current);
        changedTimer.current = setTimeout(() => onChanged?.(), 500);
    };
    useEffect(() => () => clearTimeout(changedTimer.current), []);

    const hasFilters = Object.values(filters).some(Boolean);

    useProjectRoom(projectId, {
        onTaskCreated: (task) => {
            if (hasFilters) reloadFirstPage();
            else setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [task, ...prev]));
            onChangedSoon();
        },
        onTaskUpdated: (task) => {
            replaceTask(task);
            onChangedSoon();
        },
        onTasksDeleted: ({ taskIds }) => {
            setTasks((prev) => prev.filter((task) => !taskIds.includes(task.id)));
            onChangedSoon();
        },
        onResync: () => {
            reloadFirstPage();
            onChangedSoon();
        },
    });

    const replaceTask = (updated) => setTasks((prev) => prev.map((task) => (task.id === updated.id ? { ...task, ...updated } : task)));

    const filteredTasks = tasks;

    const visibleIds = filteredTasks.map((t) => t.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedTasks.includes(id));
    const someVisibleSelected = visibleIds.some((id) => selectedTasks.includes(id));

    useEffect(() => {
        const existing = new Set(tasks.map((t) => t.id));
        setSelectedTasks((prev) => {
            const next = prev.filter((id) => existing.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [tasks]);

    const toggleTask = (taskId) =>
        setSelectedTasks((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));

    const toggleAllVisible = () =>
        setSelectedTasks((prev) =>
            allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds]))
        );

    const openTask = (task) => navigate(`/taskDetails?projectId=${task.projectId}&taskId=${task.id}`);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const handleAssign = async (task, assigneeId) => {
        try {
            const token = await getToken();
            const { data } = await api.put(`/api/tasks/${task.id}`, { assigneeId }, { headers: { Authorization: `Bearer ${token}` } });
            replaceTask(data.task);
            onChanged?.();
            toast.success(assigneeId ? "Task assigned to you" : "You're no longer assigned");
        } catch (error) {
            toast.error(error?.response?.data?.message || error.message);
        }
    };

    const actionsFor = (task) => ({
        onOpen: () => openTask(task),
        onEdit: canManage ? () => setEditingTask(task) : undefined,
        onDelete: () => handleDelete([task.id]),
        onClaim: !task.assigneeId && user ? () => handleAssign(task, user.id) : undefined,
        onUnassign: user && task.assigneeId === user.id ? () => handleAssign(task, null) : undefined,
    });

    const handleStatusChange = async (taskId, newStatus) => {
        try {
            toast.loading("Updating status...");
            const token = await getToken();

            const { data } = await api.put(`/api/tasks/${taskId}`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } });
            replaceTask(data.task);
            onChanged?.();

            toast.dismissAll();
            toast.success("Task status updated successfully");
        } catch (error) {
            toast.dismissAll();
            toast.error(error?.response?.data?.message || error.message);
        }
    };

    const handleDelete = async (taskIds) => {
        if (taskIds.length === 0) return;
        const label = taskIds.length === 1 ? "this task" : `these ${taskIds.length} tasks`;
        if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;

        try {
            const token = await getToken();
            toast.loading("Deleting tasks...");

            await api.post("/api/tasks/delete", { tasksIds: taskIds }, { headers: { Authorization: `Bearer ${token}` } });
            setTasks((prev) => prev.filter((task) => !taskIds.includes(task.id)));
            setSelectedTasks((prev) => prev.filter((id) => !taskIds.includes(id)));
            onChanged?.();

            toast.dismissAll();
            toast.success(taskIds.length === 1 ? "Task deleted" : `${taskIds.length} tasks deleted`);
        } catch (error) {
            toast.dismissAll();
            toast.error(error?.response?.data?.message || error.message);
        }
    };

    return (
        <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
                {["status", "type", "priority", "assignee"].map((name) => {
                    const options = {
                        status: [
                            { label: "All Statuses", value: "" },
                            { label: "To Do", value: "TODO" },
                            { label: "In Progress", value: "IN_PROGRESS" },
                            { label: "Done", value: "DONE" },
                        ],
                        type: [
                            { label: "All Types", value: "" },
                            { label: "Task", value: "TASK" },
                            { label: "Bug", value: "BUG" },
                            { label: "Feature", value: "FEATURE" },
                            { label: "Improvement", value: "IMPROVEMENT" },
                            { label: "Other", value: "OTHER" },
                        ],
                        priority: [
                            { label: "All Priorities", value: "" },
                            { label: "Low", value: "LOW" },
                            { label: "Medium", value: "MEDIUM" },
                            { label: "High", value: "HIGH" },
                        ],
                        assignee: [
                            { label: "All Assignees", value: "" },
                            { label: "Assigned to me", value: "me" },
                            { label: "Unassigned", value: "none" },
                            ...members.map((member) => ({ label: member.user.name, value: member.user.id })),
                        ],
                    };
                    return (
                        <select
                            key={name}
                            name={name}
                            value={filters[name]}
                            onChange={handleFilterChange}
                            className=" border not-dark:bg-white border-zinc-300 dark:border-zinc-800 outline-none px-3 py-1 rounded text-sm text-zinc-900 dark:text-zinc-200"
                        >
                            {options[name].map((opt, idx) => (
                                <option key={idx} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    );
                })}

                {/* Reset filters */}
                {(filters.status || filters.type || filters.priority || filters.assignee) && (
                    <button
                        type="button"
                        onClick={() => setFilters({ status: "", type: "", priority: "", assignee: "" })}
                        className="px-3 py-1 flex items-center gap-2 rounded bg-gradient-to-br from-purple-400 to-purple-500 text-zinc-100 dark:text-zinc-200 text-sm transition-colors"
                    >
                        <XIcon className="size-3" /> Reset
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => handleDelete(selectedTasks)}
                    disabled={selectedTasks.length === 0}
                    title={selectedTasks.length === 0 ? "Select tasks using the checkboxes to delete them" : undefined}
                    className="ml-auto px-3 py-1 flex items-center gap-2 rounded text-sm border transition-colors border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-transparent dark:disabled:border-zinc-700 dark:disabled:text-zinc-600"
                >
                    <Trash className="size-4" />
                    {selectedTasks.length > 0 ? `Delete (${selectedTasks.length})` : "Delete"}
                </button>
            </div>

            {/* Tasks Table */}
            <div className="overflow-auto rounded-lg lg:border border-zinc-300 dark:border-zinc-800">
                <div className="w-full">
                    {/* Desktop/Table View */}
                    <div className="hidden lg:block overflow-x-auto">
                        <table className="min-w-full text-sm text-left not-dark:bg-white text-zinc-900 dark:text-zinc-300">
                            <thead className="text-xs uppercase dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400 ">
                                <tr>
                                    <th className="pl-3 pr-2 w-10">
                                        <input
                                            type="checkbox"
                                            aria-label="Select all visible tasks"
                                            onChange={toggleAllVisible}
                                            checked={allVisibleSelected}
                                            ref={(el) => el && (el.indeterminate = someVisibleSelected && !allVisibleSelected)}
                                            disabled={visibleIds.length === 0}
                                            className="size-[18px] cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
                                        />
                                    </th>
                                    <th className="px-4 pl-0 py-3">Title</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Priority</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Assignee</th>
                                    <th className="px-4 py-3">Due Date</th>
                                    <th className="w-10"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTasks.length > 0 ? (
                                    filteredTasks.map((task) => {
                                        const { icon: Icon, color } = typeIcons[task.type] || {};
                                        const { background, prioritycolor } = priorityTexts[task.priority] || {};

                                        return (
                                            <tr
                                                key={task.id}
                                                onClick={() => openTask(task)}
                                                className=" border-t border-zinc-300 dark:border-zinc-800 group hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all cursor-pointer"
                                            >
                                                <td onClick={e => e.stopPropagation()} className="pl-3 pr-2">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Select ${task.title}`}
                                                        className="size-[18px] cursor-pointer accent-blue-600"
                                                        onChange={() => toggleTask(task.id)}
                                                        checked={selectedTasks.includes(task.id)}
                                                    />
                                                </td>
                                                <td className="px-4 pl-0 py-2">{task.title}</td>
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-2">
                                                        {Icon && <Icon className={`size-4 ${color}`} />}
                                                        <span className={`uppercase text-xs ${color}`}>{task.type}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className={`text-xs px-2 py-1 rounded ${background} ${prioritycolor}`}>
                                                        {task.priority}
                                                    </span>
                                                </td>
                                                <td onClick={e => e.stopPropagation()} className="px-4 py-2">
                                                    <select
                                                        name="status"
                                                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                                        value={task.status}
                                                        className="group-hover:ring ring-zinc-100 outline-none px-2 pr-4 py-1 rounded text-sm text-zinc-900 dark:text-zinc-200 cursor-pointer"
                                                    >
                                                        <option value="TODO">To Do</option>
                                                        <option value="IN_PROGRESS">In Progress</option>
                                                        <option value="DONE">Done</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2">
                                                    {task.assignee ? (
                                                        <div className="flex items-center gap-2">
                                                            <img src={task.assignee.image} className="size-5 rounded-full" alt="" />
                                                            {task.assignee.name}
                                                        </div>
                                                    ) : (
                                                        <span className="text-zinc-400 dark:text-zinc-500 italic">Unassigned</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                                                        <CalendarIcon className="size-4" />
                                                        {format(new Date(task.dueDate), "dd MMMM")}
                                                    </div>
                                                </td>
                                                <td className="pr-2">
                                                    <TaskActionsMenu {...actionsFor(task)} />
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="text-center text-zinc-500 dark:text-zinc-400 py-6">
                                            {loading ? "Loading tasks..." : "No tasks found for the selected filters."}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile/Card View */}
                    <div className="lg:hidden flex flex-col gap-4">
                        {filteredTasks.length > 0 ? (
                            filteredTasks.map((task) => {
                                const { icon: Icon, color } = typeIcons[task.type] || {};
                                const { background, prioritycolor } = priorityTexts[task.priority] || {};

                                return (
                                    <div key={task.id} className=" dark:bg-gradient-to-br dark:from-zinc-800/70 dark:to-zinc-900/50 border border-zinc-300 dark:border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Select ${task.title}`}
                                                    className="size-5 cursor-pointer accent-blue-600"
                                                    onChange={() => toggleTask(task.id)}
                                                    checked={selectedTasks.includes(task.id)}
                                                />
                                                <h3 className="text-zinc-900 dark:text-zinc-200 text-sm font-semibold">{task.title}</h3>
                                            </div>
                                            <TaskActionsMenu {...actionsFor(task)} />
                                        </div>

                                        <div className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                                            {Icon && <Icon className={`size-4 ${color}`} />}
                                            <span className={`${color} uppercase`}>{task.type}</span>
                                        </div>

                                        <div>
                                            <span className={`text-xs px-2 py-1 rounded ${background} ${prioritycolor}`}>
                                                {task.priority}
                                            </span>
                                        </div>

                                        <div>
                                            <label className="text-zinc-600 dark:text-zinc-400 text-xs">Status</label>
                                            <select
                                                name="status"
                                                onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                                value={task.status}
                                                className="w-full mt-1 bg-zinc-100 dark:bg-zinc-800 ring-1 ring-zinc-300 dark:ring-zinc-700 outline-none px-2 py-1 rounded text-sm text-zinc-900 dark:text-zinc-200"
                                            >
                                                <option value="TODO">To Do</option>
                                                <option value="IN_PROGRESS">In Progress</option>
                                                <option value="DONE">Done</option>
                                            </select>
                                        </div>

                                        <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                            {task.assignee ? (
                                                <>
                                                    <img src={task.assignee.image} className="size-5 rounded-full" alt="" />
                                                    {task.assignee.name}
                                                </>
                                            ) : (
                                                <span className="text-zinc-400 dark:text-zinc-500 italic">Unassigned</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                                            <CalendarIcon className="size-4" />
                                            {format(new Date(task.dueDate), "dd MMMM")}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-center text-zinc-500 dark:text-zinc-400 py-4">
                                {loading ? "Loading tasks..." : "No tasks found for the selected filters."}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {editingTask && (
                <TaskFormDialog
                    project={project}
                    task={editingTask}
                    onClose={() => setEditingTask(null)}
                    onSaved={(updated) => {
                        replaceTask(updated);
                        onChanged?.();
                    }}
                />
            )}

            {nextCursor && (
                <div className="flex justify-center mt-4">
                    <button
                        type="button"
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="px-4 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                        {loadingMore ? "Loading..." : "Load more"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProjectTasks;
