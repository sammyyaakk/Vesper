import { useCallback, useEffect, useRef, useState } from "react";
import { getProjectProgress } from "../utils/projectProgress";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import toast from "react-hot-toast";
import api from "../configs/api";
import { useDispatch, useSelector } from "react-redux";
import { CalendarIcon, FileIcon, MessageCircle, PenIcon, Pencil, UserCircle2 } from "lucide-react";
import { authHeaders, refreshWorkspace } from "../features/workspaceSlice";
import TaskFormDialog from "../components/TaskFormDialog";
import { canManageProject } from "../utils/permissions";

const TaskDetails = () => {
    const [searchParams] = useSearchParams();
    const projectId = searchParams.get("projectId");
    const taskId = searchParams.get("taskId");

    const { getToken } = useAuth();
    const { user } = useUser();
    const [task, setTask] = useState(null);
    const [project, setProject] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const dispatch = useDispatch();
    const workspaceRole = useSelector((state) => state.workspace.currentWorkspace?.role);

    const [nextCursor, setNextCursor] = useState(null);
    const endCursor = useRef(null);

    const appendComments = (incoming) =>
        setComments((prev) => {
            const known = new Set(prev.map((comment) => comment.id));
            return [...prev, ...incoming.filter((comment) => !known.has(comment.id))];
        });

    const fetchCommentPage = useCallback(
        async (cursor) => {
            const { data } = await api.get(`/api/tasks/${taskId}/comments`, { ...(await authHeaders(getToken)), params: cursor ? { cursor } : {} });
            if (data.endCursor) endCursor.current = data.endCursor;
            return data;
        },
        [taskId, getToken]
    );

    useEffect(() => {
        if (!projectId || !taskId) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const config = await authHeaders(getToken);
                const [taskRes, projectRes, commentPage] = await Promise.all([
                    api.get(`/api/tasks/${taskId}`, config),
                    api.get(`/api/projects/${projectId}`, config),
                    fetchCommentPage(),
                ]);
                if (cancelled) return;
                setTask(taskRes.data.task);
                setProject(projectRes.data.project);
                setComments(commentPage.comments);
                setNextCursor(commentPage.nextCursor);
            } catch (error) {
                if (!cancelled) toast.error(error?.response?.data?.message || error.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId, taskId, getToken, fetchCommentPage]);

    // Poll only for comments newer than the last one shown (replaced by live updates in Phase 5)
    useEffect(() => {
        if (!task || nextCursor) return;
        const interval = setInterval(async () => {
            try {
                const { comments: newer } = await fetchCommentPage(endCursor.current);
                if (newer.length) appendComments(newer);
            } catch {
                // a failed poll is retried on the next tick
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [task, nextCursor, fetchCommentPage]);

    const loadMoreComments = async () => {
        try {
            const data = await fetchCommentPage(nextCursor);
            appendComments(data.comments);
            setNextCursor(data.nextCursor);
        } catch (error) {
            toast.error(error?.response?.data?.message || error.message);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        try {
            toast.loading("Adding comment...");

            const token = await getToken();
            const { data } = await api.post(
                `/api/comments`,
                { taskId: task.id, content: newComment },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            appendComments([data.comment]);
            setNewComment("");
            toast.dismissAll();
            toast.success("Comment added.");
        } catch (error) {
            toast.dismissAll();
            toast.error(error?.response?.data?.message || error.message);
            console.error(error);
        }
    };

    const handleTaskSaved = (updated) => {
        setTask((prev) => ({ ...prev, ...updated }));
        dispatch(refreshWorkspace({ getToken }));
    };

    if (loading) return <div className="text-gray-500 dark:text-zinc-400 px-4 py-6">Loading task details...</div>;
    if (!task) return <div className="text-red-500 px-4 py-6">Task not found.</div>;

    return (
        <div className="flex flex-col-reverse lg:flex-row gap-6 sm:p-4 text-gray-900 dark:text-zinc-100 max-w-6xl mx-auto">
            {/* Left: Comments / Chatbox */}
            <div className="w-full lg:w-2/3">
                <div className="p-5 rounded-md  border border-gray-300 dark:border-zinc-800  flex flex-col lg:h-[80vh]">
                    <h2 className="text-base font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-white">
                        <MessageCircle className="size-5" /> Task Discussion ({comments.length})
                    </h2>

                    <div className="flex-1 md:overflow-y-scroll no-scrollbar">
                        {comments.length > 0 ? (
                            <div className="flex flex-col gap-4 mb-6 mr-2">
                                {comments.map((comment) => (
                                    <div key={comment.id} className={`sm:max-w-4/5 dark:bg-gradient-to-br dark:from-zinc-800 dark:to-zinc-900 border border-gray-300 dark:border-zinc-700 p-3 rounded-md ${comment.user.id === user?.id ? "ml-auto" : "mr-auto"}`} >
                                        <div className="flex items-center gap-2 mb-1 text-sm text-gray-500 dark:text-zinc-400">
                                            <img src={comment.user.image} alt="avatar" className="size-5 rounded-full" />
                                            <span className="font-medium text-gray-900 dark:text-white">{comment.user.name}</span>
                                            <span className="text-xs text-gray-400 dark:text-zinc-600">
                                                • {format(new Date(comment.createdAt), "dd MMM yyyy, HH:mm")}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-900 dark:text-zinc-200">{comment.content}</p>
                                    </div>
                                ))}
                                {nextCursor && (
                                    <button type="button" onClick={loadMoreComments} className="self-center text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                        Load more comments
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p className="text-gray-600 dark:text-zinc-500 mb-4 text-sm">No comments yet. Be the first!</p>
                        )}
                    </div>

                    {/* Add Comment */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                        <textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Write a comment..."
                            className="w-full dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md p-2 text-sm text-gray-900 dark:text-zinc-200 resize-none focus:outline-none focus:ring-1 focus:ring-blue-600"
                            rows={3}
                        />
                        <button onClick={handleAddComment} className="bg-gradient-to-l from-blue-500 to-blue-600 transition-colors text-white text-sm px-5 py-2 rounded " >
                            Post
                        </button>
                    </div>
                </div>
            </div>

            {/* Right: Task + Project Info */}
            <div className="w-full lg:w-1/2 flex flex-col gap-6">
                {/* Task Info */}
                <div className="p-5 rounded-md bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 ">
                    <div className="mb-3">
                        <div className="flex items-start justify-between gap-3">
                            <h1 className="text-lg font-medium text-gray-900 dark:text-zinc-100">{task.title}</h1>
                            {canManageProject(project, user?.id, workspaceRole) && (
                                <button type="button" onClick={() => setEditing(true)} className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                    <Pencil className="size-3.5" /> Edit
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            <span className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-300 text-xs">
                                {task.status}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-300 text-xs">
                                {task.type}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-green-200 dark:bg-emerald-900 text-green-900 dark:text-emerald-300 text-xs">
                                {task.priority}
                            </span>
                        </div>
                    </div>

                    {task.description && (
                        <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed mb-4">{task.description}</p>
                    )}

                    <hr className="border-zinc-200 dark:border-zinc-700 my-3" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700 dark:text-zinc-300">
                        <div className="flex items-center gap-2">
                            <img src={task.assignee?.image} className="size-5 rounded-full" alt="avatar" />
                            {task.assignee?.name || "Unassigned"}
                        </div>
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="size-4 text-gray-500 dark:text-zinc-500" />
                            Due : {format(new Date(task.dueDate), "dd MMM yyyy")}
                        </div>
                    </div>
                </div>

                {/* Project Info */}
                {project && (
                    <div className="p-4 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-gray-300 dark:border-zinc-800 ">
                        <p className="text-xl font-medium mb-4">Project Details</p>
                        <h2 className="text-gray-900 dark:text-zinc-100 flex items-center gap-2"> <PenIcon className="size-4" /> {project.name}</h2>
                        <p className="text-xs mt-3">Project Start Date: {project.startDate ? format(new Date(project.startDate), "dd MMM yyyy") : "Not set"}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-zinc-400 mt-3">
                            <span>Status: {project.status}</span>
                            <span>Priority: {project.priority}</span>
                            <span>Progress: {getProjectProgress(project.taskCounts)}%</span>
                        </div>
                    </div>
                )}
            </div>

            {editing && <TaskFormDialog project={project} task={task} onClose={() => setEditing(false)} onSaved={handleTaskSaved} />}
        </div>
    );
};

export default TaskDetails;
