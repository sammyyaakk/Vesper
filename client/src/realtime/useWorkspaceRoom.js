import { useContext, useEffect, useRef } from "react";
import { SocketContext } from "./socketContext";

// Keeps the socket in the current workspace's room. Events sent while disconnected are lost, so after a reconnect
// onResync is called to refetch.
export function useWorkspaceRoom(workspaceId, onResync) {
    const socket = useContext(SocketContext);
    const onResyncRef = useRef(onResync);

    useEffect(() => {
        onResyncRef.current = onResync;
    });

    useEffect(() => {
        if (!socket || !workspaceId) return;
        let joinedBefore = false;

        const join = async () => {
            const result = await socket.emitWithAck("workspace:join", workspaceId).catch(() => null);
            if (!result?.ok) return;
            if (joinedBefore) onResyncRef.current?.();
            joinedBefore = true;
        };

        socket.on("connect", join);
        if (socket.connected) join();

        return () => {
            socket.off("connect", join);
            socket.emit("workspace:leave", workspaceId);
        };
    }, [socket, workspaceId]);
}

// Runs onChange once a burst of workspace changes settles: ten task updates in a second cause one refetch, not ten
export function useWorkspaceChanged(onChange, delayMs = 500) {
    const socket = useContext(SocketContext);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
        onChangeRef.current = onChange;
    });

    useEffect(() => {
        if (!socket) return;
        let timer;
        const listener = () => {
            clearTimeout(timer);
            timer = setTimeout(() => onChangeRef.current?.(), delayMs);
        };
        socket.on("workspace:changed", listener);
        return () => {
            clearTimeout(timer);
            socket.off("workspace:changed", listener);
        };
    }, [socket, delayMs]);
}
