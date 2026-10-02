import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, AlertTriangle, User } from "lucide-react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

export default function TasksSummary() {
    const summary = useSelector((state) => state.workspace.summary);
    const [expanded, setExpanded] = useState({});
    const toggle = (title) => setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));

    const summaryCards = [
        {
            title: "My Tasks",
            count: summary?.tasks.mine ?? 0,
            icon: User,
            color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
            items: summary?.myTasks ?? []
        },
        {
            title: "Overdue",
            count: summary?.tasks.overdue ?? 0,
            icon: AlertTriangle,
            color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
            items: summary?.overdueTasks ?? []
        },
        {
            title: "In Progress",
            count: summary?.tasks.inProgress ?? 0,
            icon: Clock,
            color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400",
            items: summary?.inProgressTasks ?? []
        }
    ];

    return (
        <div className="space-y-6">
            {summaryCards.map((card) => (
                <div key={card.title} className="bg-white dark:bg-zinc-950 dark:bg-gradient-to-br dark:from-zinc-800/70 dark:to-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 rounded-lg overflow-hidden">
                    <div className="border-b border-zinc-200 dark:border-zinc-800 p-4 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                <card.icon className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
                            </div>
                            <div className="flex items-center justify-between flex-1">
                                <h3 className="text-sm font-medium text-gray-800 dark:text-white">{card.title}</h3>
                                <span className={`inline-block mt-1 px-2 py-1 rounded text-xs font-semibold ${card.color}`}>
                                    {card.count}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        {card.items.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-4">
                                No {card.title.toLowerCase()}
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {(expanded[card.title] ? card.items : card.items.slice(0, 3)).map((issue) => (
                                    <Link key={issue.id} to={`/taskDetails?projectId=${issue.projectId}&taskId=${issue.id}`} className="block p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                                        <h4 className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                            {issue.title}
                                        </h4>
                                        <p className="text-xs text-gray-600 dark:text-zinc-400 capitalize mt-1">
                                            {issue.type} • {issue.priority} priority
                                        </p>
                                    </Link>
                                ))}
                                {card.items.length > 3 && (
                                    <button type="button" onClick={() => toggle(card.title)} aria-expanded={Boolean(expanded[card.title])} className="flex items-center justify-center w-full text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-white mt-2">
                                        {expanded[card.title] ? (
                                            <>Show less <ChevronUp className="w-3 h-3 ml-2" /></>
                                        ) : (
                                            <>Show {card.items.length - 3} more <ChevronDown className="w-3 h-3 ml-2" /></>
                                        )}
                                    </button>
                                )}
                                {/* The dashboard summary carries only the first few tasks of each list */}
                                {expanded[card.title] && card.count > card.items.length && (
                                    <p className="text-xs text-center text-gray-400 dark:text-zinc-500">
                                        Showing {card.items.length} of {card.count}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
