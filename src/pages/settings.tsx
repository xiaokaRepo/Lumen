import * as React from "react"
import { useLocation } from "react-router-dom"
import { toast } from "sonner"

import { useTheme } from "@/components/theme-provider"
import { PageHeader } from "@/components/page-states"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { ICON_CDN } from "@/lib/icons"
import { useStore } from "@/lib/store"

const SECTIONS = [
  { id: "general", label: "通用" },
  { id: "icons", label: "图标" },
  { id: "docker", label: "Docker 与主机" },
  { id: "security", label: "安全" },
  { id: "about", label: "关于" },
]

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="grid scroll-mt-20 grid-cols-1 gap-6 border-t pt-8 first:border-t-0 first:pt-0 lg:grid-cols-[16rem_1fr]"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="max-w-xl">{children}</div>
    </section>
  )
}

function SwitchRow({
  id,
  label,
  description,
  defaultChecked,
}: {
  id: string
  label: string
  description?: string
  defaultChecked?: boolean
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} defaultChecked={defaultChecked} />
    </Field>
  )
}

function ChangePassword() {
  const [cur, setCur] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [tried, setTried] = React.useState(false)
  const errs = {
    cur: !cur ? "请输入当前密码" : undefined,
    next:
      next.length < 10
        ? "新密码至少 10 位"
        : next === cur
          ? "新密码不能与当前密码相同"
          : undefined,
    confirm: confirm !== next ? "两次输入不一致" : undefined,
  }
  const ok = !errs.cur && !errs.next && !errs.confirm
  return (
    <form
      className="flex flex-col gap-5 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!ok) return
        toast.success("密码已修改", {
          description: "其他设备上的会话已全部退出",
        })
        setCur("")
        setNext("")
        setConfirm("")
        setTried(false)
      }}
      noValidate
    >
      <h3 className="text-sm font-medium">修改密码</h3>
      <Field data-invalid={tried && !!errs.cur}>
        <FieldLabel htmlFor="cur-pw">当前密码</FieldLabel>
        <Input
          id="cur-pw"
          type="password"
          autoComplete="current-password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          aria-invalid={tried && !!errs.cur}
        />
        {tried && errs.cur && <FieldError>{errs.cur}</FieldError>}
      </Field>
      <Field data-invalid={tried && !!errs.next}>
        <FieldLabel htmlFor="new-pw">新密码</FieldLabel>
        <Input
          id="new-pw"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-invalid={tried && !!errs.next}
        />
        {tried && errs.next ? (
          <FieldError>{errs.next}</FieldError>
        ) : (
          <FieldDescription>
            至少 10 位。修改后其他设备需要重新登录。
          </FieldDescription>
        )}
      </Field>
      <Field data-invalid={tried && !!errs.confirm}>
        <FieldLabel htmlFor="confirm-pw">确认新密码</FieldLabel>
        <Input
          id="confirm-pw"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={tried && !!errs.confirm}
        />
        {tried && errs.confirm && <FieldError>{errs.confirm}</FieldError>}
      </Field>
      <div className="flex justify-end">
        <Button type="submit">修改密码</Button>
      </div>
    </form>
  )
}

const SESSIONS = [
  {
    id: "s1",
    device: "Chrome 129，Windows",
    ip: "192.168.31.105",
    last: "当前会话",
    current: true,
  },
  {
    id: "s2",
    device: "Safari，iPhone",
    ip: "100.88.12.4 (Tailscale)",
    last: "2 小时前",
  },
  { id: "s3", device: "Firefox，Ubuntu", ip: "192.168.31.66", last: "3 天前" },
]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { host } = useStore()
  const loc = useLocation()
  const [active, setActive] = React.useState(loc.hash.slice(1) || "general")

  React.useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView()
  }, [loc.hash])

  return (
    <>
      <PageHeader
        title="设置"
        actions={
          <Button onClick={() => toast.success("设置已保存")}>保存设置</Button>
        }
      />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[10rem_1fr]">
        <nav className="hidden xl:block">
          <ul className="sticky top-20 flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    active === s.id
                      ? "bg-muted font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-8">
          <Section id="general" title="通用" description="外观和默认行为。">
            <FieldGroup>
              <Field>
                <FieldLabel>主题</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={theme}
                  onValueChange={(v) => v && setTheme(v as typeof theme)}
                  className="w-fit"
                >
                  <ToggleGroupItem value="light">浅色</ToggleGroupItem>
                  <ToggleGroupItem value="dark">深色</ToggleGroupItem>
                  <ToggleGroupItem value="system">跟随系统</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="home">打开面板时显示</FieldLabel>
                <Select defaultValue="home">
                  <SelectTrigger id="home" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">主页 (应用卡片墙)</SelectItem>
                    <SelectItem value="overview">概览</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  设为主页后，可以把面板地址当作浏览器起始页。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="refresh">数据刷新间隔</FieldLabel>
                <Select defaultValue="3">
                  <SelectTrigger id="refresh" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 秒</SelectItem>
                    <SelectItem value="3">3 秒</SelectItem>
                    <SelectItem value="10">10 秒</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </Section>

          <Section
            id="icons"
            title="图标"
            description="服务图标按镜像名自动匹配，可在服务信息中手动覆盖。"
          >
            <FieldGroup>
              <Field>
                <FieldLabel>匹配优先级</FieldLabel>
                <RadioGroup defaultValue="di">
                  <Field orientation="horizontal">
                    <RadioGroupItem value="di" id="pri-di" />
                    <FieldLabel htmlFor="pri-di" className="font-normal">
                      Dashboard Icons 优先，找不到再用 selfh.st
                    </FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="sh" id="pri-sh" />
                    <FieldLabel htmlFor="pri-sh" className="font-normal">
                      selfh.st 优先，找不到再用 Dashboard Icons
                    </FieldLabel>
                  </Field>
                </RadioGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="cdn-di">Dashboard Icons 地址</FieldLabel>
                <Input
                  id="cdn-di"
                  className="tabular text-xs"
                  defaultValue={ICON_CDN["dashboard-icons"]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cdn-sh">selfh.st 地址</FieldLabel>
                <Input
                  id="cdn-sh"
                  className="tabular text-xs"
                  defaultValue={ICON_CDN.selfhst}
                />
                <FieldDescription>
                  jsDelivr 在国内访问较慢时，可换成 fastly.jsdelivr.net
                  或自建镜像。
                </FieldDescription>
              </Field>
              <SwitchRow
                id="cache-icons"
                label="缓存图标到本机"
                description="首次加载后保存在数据目录，离线时也能显示"
                defaultChecked
              />
            </FieldGroup>
          </Section>

          <Section
            id="docker"
            title="Docker 与主机"
            description="每台主机上的 lumen-agent 读取本机 Docker 和进程。"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="sock">Docker Socket</FieldLabel>
                <Input
                  id="sock"
                  className="tabular text-xs"
                  defaultValue="unix:///var/run/docker.sock"
                />
                <FieldDescription>
                  lumen-agent 默认使用 unix:///var/run/docker.sock。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="upd-int">镜像更新检查</FieldLabel>
                <Select defaultValue="6">
                  <SelectTrigger id="upd-int" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">不检查</SelectItem>
                    <SelectItem value="6">每 6 小时</SelectItem>
                    <SelectItem value="24">每天</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="mirror">镜像加速 / 代理</FieldLabel>
                <Input
                  id="mirror"
                  className="tabular text-xs"
                  placeholder="http://192.168.31.1:7890"
                />
                <FieldDescription>
                  检查更新和拉取 ghcr.io、lscr.io 镜像时使用。
                </FieldDescription>
              </Field>
              <FieldSeparator />
              <SwitchRow
                id="scan-host"
                label="发现主机进程和 systemd 服务"
                description="扫描监听端口的进程，显示在服务列表中"
                defaultChecked
              />
              <SwitchRow
                id="host-env"
                label="读取主机进程的环境变量"
                description="可能包含密码，默认关闭"
              />
            </FieldGroup>
          </Section>

          <Section
            id="security"
            title="安全"
            description="Lumen 能控制所有容器和主机进程，请保护好访问入口。"
          >
            <div className="flex flex-col gap-6">
              <ChangePassword />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="timeout">无操作自动退出</FieldLabel>
                  <Select defaultValue="7d">
                    <SelectTrigger id="timeout" className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1 小时</SelectItem>
                      <SelectItem value="1d">1 天</SelectItem>
                      <SelectItem value="7d">7 天</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <SwitchRow
                  id="allow-kill"
                  label="允许结束和调整主机进程"
                  description="关闭后进程页只读。PID 1、dockerd 等关键进程始终受保护"
                  defaultChecked
                />
                <SwitchRow
                  id="lockout"
                  label="连续 5 次密码错误后锁定 15 分钟"
                  defaultChecked
                />
              </FieldGroup>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">登录会话</h3>
                <div className="flex flex-col divide-y rounded-xl border bg-card">
                  {SESSIONS.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm">{s.device}</span>
                        <span className="tabular text-xs text-muted-foreground">
                          {s.ip}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {s.last}
                      </span>
                      {!s.current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toast.success("已退出该会话")}
                        >
                          退出
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section id="about" title="关于">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["主机", host.name || "未连接"],
                ["CPU", host.cpu || "未上报"],
                ["系统", host.os || "未上报"],
                ["内核", host.kernel || "未上报"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </div>
    </>
  )
}
