import * as React from "react"
import { IconPlus, IconServer, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, type AgentHost } from "@/lib/api"
import { useStore } from "@/lib/store"

function newToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function HostsPage() {
  const { refresh } = useStore()
  const [hosts, setHosts] = React.useState<AgentHost[]>([])
  const [name, setName] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [token, setToken] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const d = await api.hosts()
    setHosts(d.hosts ?? [])
  }, [])

  React.useEffect(() => {
    load().catch((e: Error) => toast.error(e.message))
  }, [load])

  const add = async () => {
    setBusy(true)
    try {
      await api.saveHost({ name: name.trim(), url: url.trim(), token: token.trim() })
      setName("")
      setUrl("")
      setToken("")
      await load()
      await refresh()
      toast.success("已添加主机")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败")
    } finally {
      setBusy(false)
    }
  }

  const activate = async (id: string) => {
    try {
      await api.activateHost(id)
      await load()
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "切换失败")
    }
  }

  const remove = async (h: AgentHost) => {
    try {
      await api.deleteHost(h.id)
      await load()
      await refresh()
      toast.success(`已移除 ${h.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失败")
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="主机"
        description="面板只列出服务、发送操作和显示状态。每台机器运行 lumen-agent，由它在本机处理 Docker、进程、磁盘和休眠代理。"
      />

      <div className="flex flex-col gap-3">
        {hosts.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有主机。</p>
        )}
        {hosts.map((h) => (
          <div
            key={h.id}
            className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <IconServer className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium">
                {h.name}
                {h.active && <Badge variant="secondary">当前</Badge>}
                <Badge variant={h.online ? "secondary" : "outline"}>
                  {h.online ? "在线" : "离线"}
                </Badge>
              </span>
              <span className="tabular truncate text-xs text-muted-foreground">
                {h.url || "由 agent 连入面板"}
                {h.online && h.via === "panel" ? " · 经面板接入" : ""}
              </span>
            </div>
            <div className="flex gap-2">
              {!h.active && (
                <Button variant="outline" size="sm" onClick={() => activate(h.id)}>
                  切换
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`移除 ${h.name}`}
                onClick={() => remove(h)}
              >
                <IconTrash />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <form
        className="max-w-xl rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
          <IconPlus className="size-4" />
          添加 agent
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="host-name">名称</FieldLabel>
            <Input
              id="host-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="书房 NAS"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="host-url">地址</FieldLabel>
            <Input
              id="host-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.20:7879"
              className="tabular"
            />
            <FieldDescription>
              同一局域网填写 agent 的地址，面板会去连接它。Agent 在别的 NAT 后面时留空，让它用 LUMEN_PANEL 连到这块面板。UGREENlink 只用来给人打开页面。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="host-token">令牌</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="host-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="tabular"
                placeholder="与 LUMEN_AGENT_TOKEN 相同"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setToken(newToken())}
              >
                生成
              </Button>
            </div>
            <FieldDescription>
              把同一枚令牌写进那台机器的 LUMEN_AGENT_TOKEN。
            </FieldDescription>
          </Field>
          <Button type="submit" disabled={busy || !name.trim() || token.trim().length < 8}>
            添加
          </Button>
        </FieldGroup>
      </form>
    </div>
  )
}
