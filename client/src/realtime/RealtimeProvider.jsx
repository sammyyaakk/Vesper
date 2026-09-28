import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { io } from "socket.io-client";
import { SocketContext } from "./socketContext";

const RETRY_AFTER_REFUSAL_MS = 5000;

export default function RealtimeProvider({ children }) {
    const { isSignedIn, getToken } = useAuth();
    const [socket, setSocket] = useState(null);
    const getTokenRef = useRef(getToken);

    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);

    useEffect(() => {
        if (!isSignedIn) return;
        // Session tokens expire after about a minute, so fetch a fresh one on every connect and reconnect.
        // WebSocket only: no long-polling fallback, so multiple API instances don't need sticky sessions.
        const client = io(import.meta.env.VITE_BASEURL, {
            transports: ["websocket"],
            auth: (send) => getTokenRef.current().then((token) => send({ token })),
        });
        // A refused handshake isn't retried by socket.io itself
        let retry;
        client.on("connect_error", () => {
            if (!client.active) retry = setTimeout(() => client.connect(), RETRY_AFTER_REFUSAL_MS);
        });
        setSocket(client);
        return () => {
            clearTimeout(retry);
            client.disconnect();
            setSocket(null);
        };
    }, [isSignedIn]);

    return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
