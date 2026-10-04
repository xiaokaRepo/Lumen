import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  IconEye,
  IconEyeOff,
  IconListDetails,
  IconLoader2,
  IconLock,
} from "@tabler/icons-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { HOST_IP, host } from "@/mock/data"

function strength(pw: string) {
  let s = 0
  if (pw.length >= 10) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}

function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  autoComplete,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  autoComplete: string
}) {
  const [show, setShow] = React.useState(false)
  return (
    <InputGroup className="h-10">
      <InputGroupAddon>
        <IconLock />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        autoComplete={autoComplete}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "隐藏密码" : "显示密码"}
        >
          {show ? <IconEyeOff /> : <IconEye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export function LoginPage() {
  const { setAuthed } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const setup = params.has("setup")
  const [pw, setPw] = React.useState(
    params.get("state") === "error" ? "wrong-pass" : ""
  )
  const [pw2, setPw2] = React.useState("")
  const [error, setError] = React.useState<string | null>(
    params.get("state") === "error"
      ? "密码错误，还可以尝试 3 次，之后锁定 15 分钟"
      : null
  )
  const [loading, setLoading] = React.useState(false)
  const st = strength(pw)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (setup) {
      if (pw.length < 10) return setError("密码至少 10 位")
      if (pw !== pw2) return setError("两次输入的密码不一致")
    } else if (!pw) {
      return setError("请输入密码")
    }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      if (!setup && pw === "wrong-pass")
        return setError("密码错误，还可以尝试 2 次，之后锁定 15 分钟")
      setAuthed(true)
      nav("/")
    }, 700)
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <IconListDetails className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {setup ? "设置管理员密码" : "登录 Docker-MM"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {host.model} <span className="tabular">{HOST_IP}</span>
            </p>
          </div>
        </div>

        {setup && (
          <Alert>
            <AlertDescription>
              Docker-MM 以 privileged
              运行，能控制所有容器和主机进程。请设置一个强密码，不要和 UGOS
              账户密码相同。
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <FieldGroup className="gap-5">
            <Field data-invalid={!!error && !setup}>
              <FieldLabel htmlFor="pw">{setup ? "新密码" : "密码"}</FieldLabel>
              <PasswordInput
                id="pw"
                value={pw}
                onChange={(v) => {
                  setPw(v)
                  setError(null)
                }}
                invalid={!!error && !setup}
                autoComplete={setup ? "new-password" : "current-password"}
              />
              {setup && (
                <>
                  <div className="flex gap-1" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full",
                          i < st
                            ? st >= 3
                              ? "bg-success"
                              : "bg-foreground/60"
                            : "bg-muted"
                        )}
                      />
                    ))}
                  </div>
                  <FieldDescription>
                    至少 10 位，建议混合大小写、数字和符号。
                  </FieldDescription>
                </>
              )}
              {!setup && error && <FieldError>{error}</FieldError>}
            </Field>
            {setup && (
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor="pw2">确认密码</FieldLabel>
                <PasswordInput
                  id="pw2"
                  value={pw2}
                  onChange={(v) => {
                    setPw2(v)
                    setError(null)
                  }}
                  invalid={!!error}
                  autoComplete="new-password"
                />
                {error && <FieldError>{error}</FieldError>}
              </Field>
            )}
            {!setup && (
              <div className="flex items-center gap-2">
                <Checkbox id="remember" defaultChecked />
                <Label htmlFor="remember" className="font-normal">
                  在这台设备上保持登录 7 天
                </Label>
              </div>
            )}
          </FieldGroup>
          <Button type="submit" size="lg" className="h-10" disabled={loading}>
            {loading && (
              <IconLoader2 data-icon="inline-start" className="animate-spin" />
            )}
            {setup ? "保存并进入" : "登录"}
          </Button>
        </form>

        {!setup && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            忘记密码时，在 NAS 上执行{" "}
            <code className="tabular rounded bg-muted px-1 py-0.5 text-foreground">
              docker exec docker-mm docker-mm reset-password
            </code>
          </p>
        )}
      </div>
    </main>
  )
}
