import app from "./app.js";
import { ensureStateSchema } from "./state.js";
const port = Number(process.env.API_PORT || 4000);
ensureStateSchema()
  .then(() => {
    app.listen(port, "127.0.0.1", () =>
      console.log("Crysmona API ready on port " + port),
    );
  })
  .catch((error) => {
    console.error("Unable to initialize required database state:", error);
    process.exit(1);
  });
