"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Edit03 as PenLine,
  LayersTwo01 as Layers,
  Headphones01 as Headphones,
  MessageChatSquare as MessageSquare,
  BarChart01 as BarChart3,
  LogOut01 as LogOut,
  Stars01 as Sparkles,
  Trash01 as Trash,
} from "@untitledui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";

const PRACTICE: { href: string; label: string; icon: typeof PenLine; badge?: boolean }[] = [
  { href: "/write", label: "Write", icon: PenLine },
  { href: "/review", label: "Review", icon: Layers, badge: true },
  { href: "/listen", label: "Listen", icon: Headphones },
  { href: "/chat", label: "Speak", icon: MessageSquare },
];

export function AppSidebar({ dueCount, email }: { dueCount: number; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [clearing, setClearing] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }

  // Deletes all learning data. Cascades cover the rest: documents → corrections,
  // cards → review_logs. RLS restricts every delete to the signed-in user.
  async function clearData() {
    setClearing(true);
    const supabase = createClient();
    const results = await Promise.all([
      supabase.from("documents").delete().gte("created_at", "1970-01-01"),
      supabase.from("cards").delete().gte("created_at", "1970-01-01"),
      supabase.from("chat_sessions").delete().gte("created_at", "1970-01-01"),
    ]);
    setClearing(false);
    const failed = results.find((r) => r.error);
    if (failed) toast.error(`Couldn't clear data: ${failed.error!.message}`);
    else {
      toast.success("All learning data cleared");
      router.refresh(); // reset the due badge + dashboard
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <Sparkles className="size-4.5" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold">EngCoach</div>
            <div className="text-xs text-muted-foreground">Workplace English</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Practice</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRACTICE.map(({ href, label, icon: Icon, badge }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={pathname === href} render={<Link href={href} />}>
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                  {badge && dueCount > 0 && (
                    <SidebarMenuBadge className="rounded-full border bg-background tabular-nums shadow-xs">
                      {dueCount}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Insights</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={pathname === "/progress"} render={<Link href="/progress" />}>
                  <BarChart3 />
                  <span>Progress</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SettingsDialog />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AlertDialog>
              <AlertDialogTrigger render={<SidebarMenuButton />}>
                <Trash />
                <span>Clear data</span>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all learning data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes your documents, corrections, flashcards, review
                    history and chat sessions. Your account and settings stay.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={clearData}
                    disabled={clearing}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {clearing ? "Clearing…" : "Delete everything"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator className="mx-0" />
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold uppercase text-muted-foreground">
            {email.slice(0, 1) || "?"}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{email}</span>
          <button
            onClick={signOut}
            title="Sign out"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
