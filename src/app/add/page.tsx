// app/add/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import dynamicImport from "next/dynamic";
import { Suspense } from "react";

const AddClient = dynamicImport(() => import("./AddClient"), { ssr: false });

export default function AddPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Laden…</div>}>
      <AddClient />
    </Suspense>
  );
}
