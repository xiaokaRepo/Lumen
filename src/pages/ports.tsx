import * as React from "react"
import { Link } from "react-router-dom"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconExternalLink,
  IconSearch,
} from "@tabler/icons-react"

import {
  ErrorState,
  PageHeader,
  TableSkeleton,
  useViewState,
} from "@/components/page-states"
import { ServiceIcon } from "@/components/service-icon"
import { portHref } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { KIND_LABEL } from "@/lib/format"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { allPorts, portConflicts } from "@/lib/ports"

export function PortsPage() {
  const state = useViewState()
  const { services } = useStore()
  const byId = Object.fromEntries(services.map((s) => [s.id, s]))
  const rows = allPorts(services)
  const conflicts = portConflicts(services)
  const conflictKeys = new Set(conflicts.map((c) => c.key))
  const [proto, setProto] = React.useState("all")
  const [q, setQ] = React.useState("")
  const [check, setCheck] = React.useState("8090")

  const n = Number(check)
  const checkHits = rows.filter((r) => r.port === n)
  const valid = Number.isInteger(n) && n > 0 && n < 65536

  const list = rows.filter((r) => {
    if (proto === "conflict") return conflictKeys.has(`${r.port}/${r.proto}`)
    if (proto !== "all" && r.proto !== proto) return false
    if (!q) return true
    const s = byId[r.serviceId]
    return (
      String(r.port).includes(q) ||
      s.displayName.toLowerCase().includes(q.toLowerCase())
    )
  })

  return (
    <>
      <PageHeader
        title="端口"
        description={`主机上 ${new Set(rows.map((r) => `${r.port}/${r.proto}`)).size} 个端口被 ${new Set(rows.map((r) => r.serviceId)).size} 个服务使用，包含已停止容器声明的端口。`}
      />

      {conflicts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {conflicts.map((c) => {
            const winner = c.rows.find((r) => r.bound)
            return (
              <div
                key={c.key}
                className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
              >
                <div className="flex items-center gap-2 text-destructive">
                  <IconAlertTriangle className="size-4" />
                  <span className="tabular font-medium">{c.key}</span>
                  <span className="text-sm">端口冲突</span>
                </div>
                <div className="flex flex-col gap-2">
                  {c.rows.map((r) => {
                    const s = byId[r.serviceId]
                    return (
                      <Link
                        key={r.serviceId}
                        to={`/services/${s.id}`}
                        className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/5 hover:bg-muted"
                      >
                        <ServiceIcon
                          match={s.iconMatch}
                          override={s.iconOverride}
                          kind={s.kind}
                          size="sm"
                        />
                        <span className="flex-1 text-sm font-medium">
                          {s.displayName}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            r.bound
                              ? "text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {r.bound ? "正在占用" : "启动失败"}
                        </span>
                      </Link>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  建议把{" "}
                  {
                    byId[c.rows.find((r) => !r.bound)?.serviceId ?? ""]
                      ?.displayName
                  }{" "}
                  的主机端口改为空闲端口
                  {winner && c.key.startsWith("80/")
                    ? "，或把 UGOS 管理页改到其他端口后再启动反向代理"
                    : ""}
                  。
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <InputGroup className="sm:w-64">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="搜索端口"
                placeholder="端口号或服务名"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </InputGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              value={proto}
              onValueChange={(v) => v && setProto(v)}
            >
              <ToggleGroupItem value="all">全部</ToggleGroupItem>
              <ToggleGroupItem value="tcp">TCP</ToggleGroupItem>
              <ToggleGroupItem value="udp">UDP</ToggleGroupItem>
              <ToggleGroupItem value="conflict">
                冲突{" "}
                <span className="tabular text-destructive">
                  {conflicts.length}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {state === "loading" && <TableSkeleton rows={12} cols={5} />}
          {state === "error" && (
            <ErrorState message="读取 /proc/net/tcp 失败。请确认容器使用 pid: host 并以 privileged 运行。" />
          )}
          {(state === "ready" || state === "empty") && (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">端口</TableHead>
                    <TableHead>协议</TableHead>
                    <TableHead>服务</TableHead>
                    <TableHead className="hidden md:table-cell">映射</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      监听地址
                    </TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r, i) => {
                    const s = byId[r.serviceId]
                    const conflict = conflictKeys.has(`${r.port}/${r.proto}`)
                    const p = s.ports.find(
                      (x) => x.host === r.port && x.proto === r.proto
                    )!
                    return (
                      <TableRow
                        key={i}
                        className={cn(
                          conflict && "bg-destructive/5 hover:bg-destructive/10"
                        )}
                      >
                        <TableCell
                          className={cn(
                            "tabular pl-4 font-medium",
                            conflict && "text-destructive"
                          )}
                        >
                          {r.port}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground uppercase">
                          {r.proto}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/services/${s.id}`}
                            className="flex items-center gap-2.5 hover:underline"
                          >
                            <ServiceIcon
                              match={s.iconMatch}
                              override={s.iconOverride}
                              kind={s.kind}
                              size="sm"
                            />
                            <span className="flex flex-col">
                              <span className="text-sm">{s.displayName}</span>
                              <span className="text-xs text-muted-foreground">
                                {KIND_LABEL[s.kind]}
                              </span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="tabular hidden text-xs text-muted-foreground md:table-cell">
                          {r.containerPort !== undefined
                            ? `${r.port} → ${r.containerPort}`
                            : s.networkMode === "host"
                              ? "host 网络"
                              : "主机进程"}
                        </TableCell>
                        <TableCell className="tabular hidden text-xs text-muted-foreground sm:table-cell">
                          {r.ip}
                        </TableCell>
                        <TableCell>
                          {r.bound ? (
                            <span className="text-sm">监听中</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {conflict ? "未能绑定" : "未监听"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="pr-3">
                          {r.proto === "tcp" && p.web && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              asChild
                              aria-label="打开"
                            >
                              <a
                                href={portHref(p)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <IconExternalLink />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <h2 className="text-base font-medium">端口检查</h2>
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <Field data-invalid={!valid}>
              <FieldLabel htmlFor="port-check">端口号</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="port-check"
                  inputMode="numeric"
                  className="tabular"
                  value={check}
                  onChange={(e) => setCheck(e.target.value.replace(/\D/g, ""))}
                  aria-invalid={!valid}
                />
              </InputGroup>
              {!valid ? (
                <FieldDescription className="text-destructive">
                  请输入 1 到 65535 之间的端口
                </FieldDescription>
              ) : (
                <FieldDescription>
                  部署新容器前，先确认端口没有被占用。
                </FieldDescription>
              )}
            </Field>
            {valid &&
              (checkHits.length === 0 ? (
                <div className="flex items-start gap-2 text-sm">
                  <IconCircleCheck className="mt-0.5 size-4 text-success" />
                  <span>
                    <span className="tabular">{n}</span> 空闲，可以使用
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-sm">
                  <span className="flex items-center gap-2 text-destructive">
                    <IconAlertTriangle className="size-4" />
                    已被占用
                  </span>
                  {checkHits.map((h) => (
                    <span
                      key={h.serviceId + h.proto}
                      className="flex items-center justify-between"
                    >
                      <span>{byId[h.serviceId].displayName}</span>
                      <Badge variant="outline" className="uppercase">
                        {h.proto}
                      </Badge>
                    </span>
                  ))}
                </div>
              ))}
            <div className="border-t pt-3 text-xs text-muted-foreground">
              附近空闲端口
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[8082, 8083, 8085, 8090, 8888].map((p) => (
                  <button
                    key={p}
                    onClick={() => setCheck(String(p))}
                    className="tabular rounded-md border px-1.5 py-0.5 text-foreground hover:bg-muted"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
