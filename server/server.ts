import { createServer } from "node:http";
import { app } from "./app.js";
import { logger } from "./configs/logger.js";
import { createRealtime } from "./realtime/index.js";

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
createRealtime(httpServer);

httpServer.listen(PORT, () => logger.info({ port: PORT }, "Server listening"));
