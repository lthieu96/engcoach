"use client";

import { useTheme } from "next-themes";
import { Sun, Moon01 as Moon } from "@untitledui/icons";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <SidebarMenuButton onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {/* CSS decides which icon shows, so no hydration-mismatch guard is needed. */}
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
      <span>Theme</span>
    </SidebarMenuButton>
  );
}
