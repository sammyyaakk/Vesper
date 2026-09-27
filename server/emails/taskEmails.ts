const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

const appUrl = () => {
    const url = process.env.APP_URL;
    if (url) return url.replace(/\/+$/, "");
    if (process.env.NODE_ENV === "production") throw new Error("APP_URL must be set in production");
    return "http://localhost:5173";
};

export const taskUrl = (projectId: string, taskId: string) =>
    `${appUrl()}/taskDetails?projectId=${encodeURIComponent(projectId)}&taskId=${encodeURIComponent(taskId)}`;

interface TaskEmailInput {
    recipientName: string;
    projectName: string;
    projectId: string;
    taskId: string;
    title: string;
    description: string | null;
    dueDate: Date;
}

const layout = (intro: string, input: TaskEmailInput) => {
    const e = escapeHtml;
    return `
<div style="max-width: 600px;">
    <h2>Hi ${e(input.recipientName)},</h2>
    <p style="font-size: 16px;">${intro}</p>
    <p style="font-size: 18px; font-weight: bold; color: #007bff; margin: 8px 0;">${e(input.title)}</p>
    <div style="border: 1px solid #ddd; padding: 12px 16px; border-radius: 6px; margin-bottom: 30px;">
        <p style="margin: 6px 0;"><strong>Project:</strong> ${e(input.projectName)}</p>
        <p style="margin: 6px 0;"><strong>Description:</strong> ${e(input.description ?? "")}</p>
        <p style="margin: 6px 0;"><strong>Due date:</strong> ${e(input.dueDate.toDateString())}</p>
    </div>
    <a href="${e(taskUrl(input.projectId, input.taskId))}" style="background-color: #007bff; padding: 12px 24px; border-radius: 5px; color: #fff; font-weight: 600; font-size: 16px; text-decoration: none;">View task</a>
</div>`;
};

export const assignmentEmail = (input: TaskEmailInput) => ({
    subject: `New task in ${input.projectName}`,
    body: layout("You've been assigned a task:", input),
});

export const reminderEmail = (input: TaskEmailInput) => ({
    subject: `Due today: ${input.title}`,
    body: layout("This task is due and isn't done yet:", input),
});
