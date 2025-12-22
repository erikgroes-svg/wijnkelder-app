"use client";

import { useSearchParams } from "next/navigation";

export default function SearchParamsGate({
  children,
}: {
  children: (sp: ReturnType<typeof useSearchParams>) => React.ReactNode;
}) {
  const sp = useSearchParams();
  return <>{children(sp)}</>;
}
