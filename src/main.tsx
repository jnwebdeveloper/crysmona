import { createRoot } from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./lib/Store";
import "./styles/styles.css";
import "./styles/commerce.css";
const root = document.getElementById("root");
if (!root) throw new Error("Root missing");
createRoot(root).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
