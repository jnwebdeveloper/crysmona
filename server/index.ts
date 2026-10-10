import app from "./app.js";
import { log } from "./lib/logger.js";
import { ensureStateSchema } from "./lib/schema.js";
const port = Number(process.env.API_PORT || 4000);
ensureStateSchema()
  .then(() => {
    app.listen(port, "127.0.0.1", () =>
      log.info("Crysmona API ready on port " + port),
    );
  })
  .catch((error) => {
    log.error("Unable to initialize required database state", { error });
    process.exit(1);
  });
