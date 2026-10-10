import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { CartProvider } from "./lib/cart";
import { StoreProvider } from "./lib/Store";
import { UiProvider } from "./lib/ui";
import "./styles/styles.css";
import "./styles/commerce.css";
const root = document.getElementById("root");
if (!root) throw new Error("Root missing");
createRoot(root).render(
  <BrowserRouter>
    <StoreProvider>
      <UiProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </UiProvider>
    </StoreProvider>
  </BrowserRouter>,
);
