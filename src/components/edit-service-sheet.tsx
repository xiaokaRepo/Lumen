import * as React from "react"
import { toast } from "sonner"

import { IconPicker } from "@/components/icon-picker"
import { ServiceIcon } from "@/components/service-icon"
import { portHref } from "@/components/status"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SOURCE_LABEL, slugCandidates, type IconRef } from "@/lib/icons"
import { useStore } from "@/lib/store"
import { GROUPS, type Service } from "@/mock/data"

export function EditServiceSheet({
  service,
  open,
  onOpenChange,
}: {
  service: Service
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { updateMeta } = useStore()
  const [name, setName] = React.useState(service.displayName)
  const [group, setGroup] = React.useState(service.group)
  const [newGroup, setNewGroup] = React.useState("")
  const [url, setUrl] = React.useState(service.webUrl ?? "")
  const [remote, setRemote] = React.useState(service.remoteUrl ?? "")
  const [desc, setDesc] = React.useState(service.description ?? "")
  const [icon, setIcon] = React.useState<IconRef | undefined>(
    service.iconOverride
  )
  const [showHome, setShowHome] = React.useState(!service.hideOnHome)
  const [idle, setIdle] = React.useState(!!service.idleSleep)
  const [picker, setPicker] = React.useState(false)
  const canIdle = service.kind === "container" || service.kind === "compose"

  const webPorts = service.ports.filter((p) => p.proto === "tcp")
  const nameError = name.trim() === "" ? "显示名称不能为空" : undefined

  const save = () => {
    if (nameError) return
    void updateMeta(service.id, {
      displayName: name.trim(),
      group: group === "__new" ? newGroup.trim() || service.group : group,
      webUrl: url.trim() || undefined,
      remoteUrl: remote.trim() || undefined,
      description: desc,
      iconOverride: icon,
      hideOnHome: !showHome,
      idleSleep: canIdle ? idle : false,
    })
      .then(() => {
        toast.success("已保存", {
          description: `${name} 的显示信息已更新，不影响容器本身。`,
        })
        onOpenChange(false)
      })
      .catch((e: Error) => toast.error(e.message))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>编辑服务信息</SheetTitle>
          <SheetDescription>
            这些信息只保存在 Lumen 中，不会修改容器或 compose 文件。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel>图标</FieldLabel>
              <div className="flex items-center gap-4 rounded-lg border p-3">
                <ServiceIcon
                  match={service.iconMatch}
                  override={icon}
                  kind={service.kind}
                  size="lg"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {icon
                      ? `手动指定 (${SOURCE_LABEL[icon.source]})`
                      : "自动匹配"}
                  </span>
                  <span className="tabular truncate text-xs text-muted-foreground">
                    {icon
                      ? (icon.slug ?? icon.url)
                      : `按 ${slugCandidates(service.iconMatch)[0] ?? service.name} 匹配`}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPicker(true)}
                >
                  更换
                </Button>
              </div>
            </Field>

            <Field data-invalid={!!nameError}>
              <FieldLabel htmlFor="svc-name">显示名称</FieldLabel>
              <Input
                id="svc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!nameError}
              />
              {nameError ? (
                <FieldDescription className="text-destructive">
                  {nameError}
                </FieldDescription>
              ) : (
                <FieldDescription>
                  原始名称 <code className="tabular">{service.name}</code>
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="svc-group">分组</FieldLabel>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger id="svc-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value="__new">新建分组</SelectItem>
                </SelectContent>
              </Select>
              {group === "__new" && (
                <Input
                  aria-label="新分组名称"
                  placeholder="新分组名称"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                />
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="svc-url">局域网地址</FieldLabel>
              <Input
                id="svc-url"
                placeholder="http://192.168.31.20:8096"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {webPorts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {webPorts.map((p) => (
                    <Button
                      key={`${p.host}`}
                      variant="outline"
                      size="xs"
                      onClick={() => setUrl(portHref(p))}
                    >
                      <span className="tabular">
                        {portHref(p).replace(/^https?:\/\//, "")}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
              <FieldDescription>
                人在局域网里打开面板时，卡片用这个地址。
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="svc-remote">远程地址</FieldLabel>
              <Input
                id="svc-remote"
                placeholder="https://app.example.com"
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
              />
              <FieldDescription>
                可选。人从公网域名打开面板时，卡片改用这个地址。留空则始终用局域网地址。
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="svc-desc">描述</FieldLabel>
              <Textarea
                id="svc-desc"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="显示在主页卡片和详情页"
              />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="svc-home">在主页显示</FieldLabel>
                <FieldDescription>关闭后仍会出现在服务列表中</FieldDescription>
              </FieldContent>
              <Switch
                id="svc-home"
                checked={showHome}
                onCheckedChange={setShowHome}
              />
            </Field>

            {canIdle && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="svc-idle">空闲时休眠</FieldLabel>
                  <FieldDescription>
                    默认关闭。连续 30 分钟 CPU 低于整机的 2%，且收发都低于 32
                    KB/s，才会停止并释放内存。
                    {service.stack ? " 打开后整个 compose 栈一起休眠。" : ""}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="svc-idle"
                  checked={idle}
                  onCheckedChange={setIdle}
                />
              </Field>
            )}
          </FieldGroup>
        </div>

        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={!!nameError}>
            保存
          </Button>
        </SheetFooter>
      </SheetContent>
      <IconPicker
        open={picker}
        onOpenChange={setPicker}
        match={service.iconMatch}
        name={name}
        value={icon}
        onChange={setIcon}
      />
    </Sheet>
  )
}
