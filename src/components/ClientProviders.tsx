"use client";

import { CallProvider } from "@/components/calls/CallProvider";

export default function ClientProviders({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  return <CallProvider userId={userId}>{children}</CallProvider>;
}
