import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Due-card count for the Review badge.
  const { count: dueCount } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .lte("due", new Date().toISOString());

  return (
    <SidebarProvider>
      <AppSidebar dueCount={dueCount ?? 0} email={user.email ?? ""} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:hidden">
          <SidebarTrigger />
          <span className="font-semibold tracking-tight">EngCoach</span>
        </header>
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
