import { useEffect, useRef, useState } from "react";
import { ExternalLink, MoreVertical, Pencil, Trash, UserMinus, UserPlus } from "lucide-react";

const MENU_WIDTH = 160;

export default function TaskActionsMenu({ onOpen, onEdit, onDelete, onClaim, onUnassign }) {
    const [position, setPosition] = useState(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!position) return;
        const close = () => setPosition(null);
        const onPointerDown = (e) => {
            if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close();
        };
        const onKeyDown = (e) => e.key === "Escape" && close();
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    }, [position]);

    const toggle = () => {
        if (position) return setPosition(null);
        const rect = buttonRef.current.getBoundingClientRect();
        setPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH) });
    };

    const run = (action) => {
        setPosition(null);
        action();
    };

    const itemClasses = "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800";

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <button
                ref={buttonRef}
                type="button"
                aria-label="Task actions"
                aria-haspopup="menu"
                aria-expanded={Boolean(position)}
                onClick={toggle}
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            >
                <MoreVertical className="size-4" />
            </button>

            {position && (
                <div
                    ref={menuRef}
                    role="menu"
                    style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
                    className="fixed z-50 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm text-zinc-800 dark:text-zinc-200"
                >
                    <button type="button" role="menuitem" onClick={() => run(onOpen)} className={itemClasses}>
                        <ExternalLink className="size-4" /> Open task
                    </button>
                    {onEdit && (
                        <button type="button" role="menuitem" onClick={() => run(onEdit)} className={itemClasses}>
                            <Pencil className="size-4" /> Edit task
                        </button>
                    )}
                    {onClaim && (
                        <button type="button" role="menuitem" onClick={() => run(onClaim)} className={itemClasses}>
                            <UserPlus className="size-4" /> Assign to me
                        </button>
                    )}
                    {onUnassign && (
                        <button type="button" role="menuitem" onClick={() => run(onUnassign)} className={itemClasses}>
                            <UserMinus className="size-4" /> Unassign me
                        </button>
                    )}
                    <button type="button" role="menuitem" onClick={() => run(onDelete)} className={`${itemClasses} text-red-600 dark:text-red-400`}>
                        <Trash className="size-4" /> Delete task
                    </button>
                </div>
            )}
        </div>
    );
}
