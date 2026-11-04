"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppBackground } from "@/components/AppBackground";
import { Sidebar } from "@/components/Sidebar";

/**
 * Glass background + sidebar around every signed-in page.
 * The login page brings its own split layout, so it is left bare.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname === "/login") return <>{children}</>;

  return (
    <>
      <AppBackground />
      <div className="mx-auto flex max-w-[1340px] flex-col gap-4 p-4 lg:flex-row lg:items-start lg:gap-[18px] lg:px-6 lg:py-7">
        {session?.user && (
          <Sidebar
            name={session.user.name ?? ""}
            email={session.user.email ?? ""}
          />
        )}
        <main className="panel panel-glass min-w-0 flex-1 p-[18px] lg:px-7 lg:pt-[26px] lg:pb-7">
          {children}
        </main>
      </div>
    </>
  );
}
