import { createRoot } from "react-dom/client";
import App from "./app/App";
import { StoreProvider } from "./app/Store";
import "./styles.css";
import "./commerce.css";
const root = document.getElementById("root");
if (!root) throw new Error("Root missing");
createRoot(root).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
