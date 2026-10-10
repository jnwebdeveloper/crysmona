import React, { createContext, useContext, useEffect, useState } from "react";

// Storefront-wide UI state: the bag toast and the login dialog. Rendered by
// StoreLayout; any page can trigger them without prop drilling.
type Ui = {
  toast: string;
  showToast: (message: string) => void;
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
};

const UiContext = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState(""),
    [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <UiContext.Provider
      value={{
        toast,
        showToast: setToast,
        loginOpen,
        openLogin: () => setLoginOpen(true),
        closeLogin: () => setLoginOpen(false),
      }}
    >
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi must be used inside UiProvider");
  return ui;
}
