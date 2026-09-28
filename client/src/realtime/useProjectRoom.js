import { useContext, useEffect, useRef } from "react";
import { SocketContext } from "./socketContext";

const EVENTS = {
    "task:created": "onTaskCreated",
    "task:updated": "onTaskUpdated",
    "tasks:deleted": "onTasksDeleted",
    "comment:created": "onCommentCreated",
};

// Live updates for one project. Handlers must be safe to receive twice: the user's own changes come back as events too.
// Events sent while disconnected are lost, so after a reconnect onResync is called to refetch.
export function useProjectRoom(projectId, handlers) {
    const socket = useContext(SocketContext);
    const handlersRef = useRef(handlers);

    useEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        if (!socket || !projectId) return;
        let joinedBefore = false;

        const join = async () => {
            const result = await socket.emitWithAck("project:join", projectId).catch(() => null);
            if (!result?.ok) return;
            if (joinedBefore) handlersRef.current.onResync?.();
            joinedBefore = true;
        };

        const listeners = Object.entries(EVENTS).map(([event, handler]) => [
            event,
            // A socket can be in several project rooms; comments carry no projectId and are filtered by task instead
            (payload) => {
                if ((payload.projectId ?? projectId) === projectId) handlersRef.current[handler]?.(payload);
            },
        ]);
        for (const [event, listener] of listeners) socket.on(event, listener);
        socket.on("connect", join);
        if (socket.connected) join();

        return () => {
            for (const [event, listener] of listeners) socket.off(event, listener);
            socket.off("connect", join);
            socket.emit("project:leave", projectId);
        };
    }, [socket, projectId]);
}
