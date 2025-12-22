"use client";

import React, { Suspense } from "react";
import AddClient from "./AddClient";

export default function AddPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Laden…</div>}>
      <AddClient />
    </Suspense>
  );
}
