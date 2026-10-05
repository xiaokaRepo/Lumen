import * as React from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom"
import {
  IconAppWindow,
  IconBell,
  IconBox,
  IconCloudDownload,
  IconCpu,
  IconDatabase,
  IconLayoutDashboard,
  IconListDetails,
  IconLogout,
  IconMoon,
  IconNetwork,
  IconPlug,
  IconSearch,
  IconSettings,
  IconStack2,
  IconSun,
} from "@tabler/icons-react"

import { useTheme } from "@/components/theme-provider"
import { ServiceIcon } from "@/components/service-icon"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { portConflicts } from "@/lib/ports"
import { useStore } from "@/lib/store"

const NAV = [
  {
    label: "",
    items: [
      { to: "/home", label: "主页", icon: IconAppWindow },
      { to: "/", label: "概览", icon: IconLayoutDashboard, end: true },
      { to: "/services", label: "服务", icon: IconStack2 },
      {
        to: "/updates",
        label: "镜像更新",
        icon: IconCloudDownload,
      },
      {
        to: "/ports",
        label: "端口",
        icon: IconPlug,
        badgeKey: "ports",
        danger: true,
      },
      { to: "/processes", label: "进程", icon: IconCpu },
      {
        to: "/alerts",
        label: "告警",
        icon: IconBell,
        danger: true,
      },
    ],
  },
  {
    label: "Docker 资源",
    items: [
      { to: "/images", label: "镜像", icon: IconBox },
      { to: "/networks", label: "网络", icon: IconNetwork },
      { to: "/volumes", label: "存储卷", icon: IconDatabase },
    ],
  },
]

const TITLES: Record<string, string> = {
  "": "概览",
  home: "主页",
  services: "服务",
  updates: "镜像更新",
  ports: "端口",
  processes: "进程",
  alerts: "告警",
  images: "镜像",
  networks: "网络",
  volumes: "存储卷",
  settings: "设置",
}

function AppSidebar() {
  const { pathname } = useLocation()
  const { host, services } = useStore()
  const portBadge = portConflicts(services).length
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <IconListDetails className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-semibold">Lumen</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {host.model}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g, gi) => (
          <SidebarGroup key={gi}>
            {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => {
                  const active =
                    it.to === "/"
                      ? pathname === "/"
                      : pathname.startsWith(it.to)
                  return (
                    <SidebarMenuItem key={it.to}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={it.label}
                        asChild
                      >
                        <NavLink to={it.to}>
                          <it.icon />
                          <span>{it.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {"badgeKey" in it && portBadge > 0 ? (
                        <SidebarMenuBadge className="text-destructive">
                          <span className="tabular">{portBadge}</span>
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/settings")}
              tooltip="设置"
              asChild
            >
              <NavLink to="/settings">
                <IconSettings />
                <span>设置</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function CommandMenu() {
  const [open, setOpen] = React.useState(false)
  const nav = useNavigate()
  const { services } = useStore()
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const go = (to: string) => {
    setOpen(false)
    nav(to)
  }
  return (
    <>
      <Button
        variant="outline"
        className="hidden w-64 justify-start text-muted-foreground md:inline-flex"
        onClick={() => setOpen(true)}
      >
        <IconSearch data-icon="inline-start" />
        搜索服务、端口、进程
        <Kbd className="ml-auto">Ctrl K</Kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="搜索"
      >
        <IconSearch />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="搜索"
        description="跳转到服务或页面"
      >
        <Command>
          <CommandInput placeholder="输入服务名、镜像或端口号" />
          <CommandList>
            <CommandEmpty>没有匹配结果</CommandEmpty>
            <CommandGroup heading="服务">
              {services.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.displayName} ${s.name} ${s.image ?? ""} ${s.ports.map((p) => p.host).join(" ")}`}
                  onSelect={() => go(`/services/${s.id}`)}
                >
                  <ServiceIcon
                    match={s.iconMatch}
                    override={s.iconOverride}
                    kind={s.kind}
                    size="sm"
                  />
                  <span>{s.displayName}</span>
                  <span className="tabular ml-auto truncate text-xs text-muted-foreground">
                    {s.ports
                      .slice(0, 2)
                      .map((p) => p.host)
                      .join(", ")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="页面">
              {NAV.flatMap((g) => g.items).map((it) => (
                <CommandItem key={it.to} onSelect={() => go(it.to)}>
                  <it.icon />
                  {it.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换主题">
          <IconSun className="dark:hidden" />
          <IconMoon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => setTheme(v as typeof theme)}
        >
          <DropdownMenuRadioItem value="light">浅色</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">深色</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">跟随系统</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const { logout } = useStore()
  const nav = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-medium">
            管
          </span>
          <span className="hidden sm:inline">admin</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          从 192.168.31.105 登录
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => nav("/settings#security")}>
          修改密码
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            void logout().then(() => nav("/login"))
          }}
        >
          <IconLogout />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  const loc = useLocation()
  const reduce = useReducedMotion()
  const seg = loc.pathname.split("/")[1] ?? ""
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-1 h-4 data-[orientation=vertical]:self-center"
          />
          <span className="text-sm font-medium">{TITLES[seg] ?? ""}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <CommandMenu />
            <Button variant="ghost" size="icon" asChild aria-label="告警">
              <Link to="/alerts">
                <IconBell />
              </Link>
            </Button>
            <ThemeMenu />
            <UserMenu />
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 md:px-6">
          <motion.div
            key={loc.pathname}
            className="flex flex-1 flex-col gap-6"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
