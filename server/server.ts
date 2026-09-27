import { app } from "./app.js";
import { logger } from "./configs/logger.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => logger.info({ port: PORT }, "Server listening"));
