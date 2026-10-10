import React from "react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <main className="page wishlist-empty">
      <h1>Page not found</h1>
      <Link to="/">Return home</Link>
    </main>
  );
}
