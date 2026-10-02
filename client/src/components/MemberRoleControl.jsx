import { useEffect, useState } from "react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { UserMinus } from "lucide-react";
import toast from "react-hot-toast";

const CLERK_ROLES = { ADMIN: "org:admin", MEMBER: "org:member" };

const RoleBadge = ({ role, note }) => (
    <span className="inline-flex items-center gap-2">
        <span className={`px-2 py-1 text-xs rounded-md ${role === "ADMIN" ? "bg-purple-100 dark:bg-purple-500/20 text-purple-500 dark:text-purple-400" : "bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300"}`}>
            {role}
        </span>
        {note && <span className="text-xs text-gray-500 dark:text-zinc-400">{note}</span>}
    </span>
);

const clerkError = (error) => error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || error.message;

// Admins change roles and remove members through Clerk (the source of truth, which also enforces the permission).
// The change returns via the webhook sync a few seconds later and reaches every open screen through workspace:changed.
export default function MemberRoleControl({ member, workspace }) {
    const { organization } = useOrganization();
    const { user } = useUser();
    const [pendingRole, setPendingRole] = useState(null);
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        if (pendingRole && member.role === pendingRole) setPendingRole(null);
    }, [member.role, pendingRole]);

    const isSelf = member.userId === user?.id;
    const isOwner = member.userId === workspace.ownerId;
    const canManage = workspace.role === "ADMIN" && organization?.id === workspace.id;

    if (!canManage || isSelf || isOwner) {
        return <RoleBadge role={member.role} note={isOwner ? "owner" : isSelf && workspace.role === "ADMIN" ? "you" : null} />;
    }

    const changeRole = async (role) => {
        setPendingRole(role);
        try {
            await organization.updateMember({ userId: member.userId, role: CLERK_ROLES[role] });
            toast.success(`${member.user.name} is now ${role === "ADMIN" ? "an admin" : "a member"}`);
        } catch (error) {
            setPendingRole(null);
            toast.error(clerkError(error));
        }
    };

    const remove = async () => {
        if (!window.confirm(`Remove ${member.user.name} from ${workspace.name}? They lose access to all its projects.`)) return;
        setRemoving(true);
        try {
            await organization.removeMember(member.userId);
            toast.success(`${member.user.name} was removed`);
        } catch (error) {
            setRemoving(false);
            toast.error(clerkError(error));
        }
    };

    if (removing) return <span className="text-xs text-gray-500 dark:text-zinc-400">Removing…</span>;

    return (
        <span className="inline-flex items-center gap-2">
            <select
                aria-label={`Role of ${member.user.name}`}
                value={pendingRole ?? member.role}
                disabled={Boolean(pendingRole)}
                onChange={(e) => changeRole(e.target.value)}
                className="text-xs rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-800 dark:text-zinc-200 px-2 py-1 disabled:opacity-60"
            >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
            </select>
            {pendingRole && <span className="text-xs text-gray-500 dark:text-zinc-400">updating…</span>}
            <button
                type="button"
                onClick={remove}
                aria-label={`Remove ${member.user.name}`}
                title="Remove from workspace"
                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
                <UserMinus className="size-4" />
            </button>
        </span>
    );
}
