export const dynamic = "force-dynamic";

import dynamicImport from "next/dynamic";

const AddClient = dynamicImport(() => import("./AddClient"), { ssr: false });

export default function AddPage() {
  return <AddClient />;
}
