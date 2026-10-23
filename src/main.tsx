import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./styles/styles.css";
import "./styles/commerce.css";
const root = document.getElementById("root");
if (!root) throw new Error("Root missing");
createRoot(root).render(
  // Each webapp brings its own providers: see StoreLayout and AdminLayout.
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
