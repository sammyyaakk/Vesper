import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import api from "../configs/api";

const RequiredMark = () => <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>;

const emptyForm = {
    title: "",
    description: "",
    type: "TASK",
    status: "TODO",
    priority: "MEDIUM",
    assigneeId: "",
    dueDate: "",
};

// Due dates are stored as midnight UTC of the picked day, so the UTC date is the one to show in the date input
const formFromTask = (task) => ({
    title: task.title,
    description: task.description ?? "",
    type: task.type,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ?? "",
    dueDate: task.dueDate.slice(0, 10),
});

// Creates a task, or edits `task` when one is passed
export default function TaskFormDialog({ project, task, onClose, onSaved }) {
    const { getToken } = useAuth();
    const { user } = useUser();
    const teamMembers = project?.members || [];
    const isProjectMember = teamMembers.some((member) => member.user.id === user?.id);
    const isEdit = Boolean(task);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState(() => (isEdit ? formFromTask(task) : emptyForm));

    const isValid = formData.title.trim() !== "" && formData.dueDate !== "";

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isValid) return;
        setIsSubmitting(true);

        try {
            const config = { headers: { Authorization: `Bearer ${await getToken()}` } };
            const { data } = isEdit
                ? await api.put(`/api/tasks/${task.id}`, formData, config)
                : await api.post("/api/tasks", { ...formData, projectId: project.id }, config);

            toast.success(data.message);
            onSaved?.(data.task);
            onClose();
        } catch (error) {
            toast.error(error?.response?.data?.message || error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/60 backdrop-blur">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg shadow-lg w-full max-w-md p-6 text-zinc-900 dark:text-white">
                <h2 className="text-xl font-bold mb-4">{isEdit ? "Edit Task" : "Create New Task"}</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Title */}
                    <div className="space-y-1">
                        <label htmlFor="title" className="text-sm font-medium">Title<RequiredMark /></label>
                        <input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Task title" className="w-full rounded dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-zinc-900 dark:text-zinc-200 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                        <label htmlFor="description" className="text-sm font-medium">Description</label>
                        <textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the task" className="w-full rounded dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-zinc-900 dark:text-zinc-200 text-sm mt-1 h-24 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    {/* Type & Priority */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Type</label>
                            <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full rounded dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-zinc-900 dark:text-zinc-200 text-sm mt-1" >
                                <option value="BUG">Bug</option>
                                <option value="FEATURE">Feature</option>
                                <option value="TASK">Task</option>
                                <option value="IMPROVEMENT">Improvement</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Priority</label>
                            <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="w-full rounded dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-zinc-900 dark:text-zinc-200 text-sm mt-1" >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                            </select>
                        </div>
                    </div>

                    {/* Assignee and Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">Assignee</label>
                                {isProjectMember && formData.assigneeId !== user.id && (
                                    <button type="button" onClick={() => setFormData({ ...formData, assigneeId: user.id })} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                                        Assign to me
                                    </button>
                                )}
                            </div>
                            <select value={formData.assigneeId} onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })} className="w-full rounded dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-zinc-900 dark:text-zinc-200 text-sm mt-1" >
                                <option value="">Unassigned</option>
                                {teamMembers.map((member) => (
                                    <option key={member?.user.id} value={member?.user.id}>
                                        {member?.user.email}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Status</label>
                            <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full rounded dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-zinc-900 dark:text-zinc-200 text-sm mt-1" >
                                <option value="TODO">To Do</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="DONE">Done</option>
                            </select>
                        </div>
                    </div>

                    {/* Due Date: new tasks can't start overdue; an existing overdue task keeps its date unless changed */}
                    <div className="space-y-1">
                        <label htmlFor="dueDate" className="text-sm font-medium">Due Date<RequiredMark /></label>
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="size-5 text-zinc-500 dark:text-zinc-400" />
                            <input id="dueDate" type="date" required value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} min={isEdit ? undefined : new Date().toISOString().split('T')[0]} className="w-full rounded dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-zinc-900 dark:text-zinc-200 text-sm mt-1" />
                        </div>
                        {formData.dueDate && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {format(new Date(formData.dueDate), "PPP")}
                            </p>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <p className="mr-auto text-xs text-zinc-500 dark:text-zinc-400"><span className="text-red-500">*</span> Required</p>
                        <button type="button" onClick={onClose} className="rounded border border-zinc-300 dark:border-zinc-700 px-5 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition" >
                            Cancel
                        </button>
                        <button type="submit" disabled={!isValid || isSubmitting} title={!isValid ? "Fill in the required fields" : undefined} className="rounded px-5 py-2 text-sm bg-gradient-to-br from-blue-500 to-blue-600 hover:opacity-90 text-white dark:text-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed" >
                            {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Task"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
