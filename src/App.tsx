import { MotionConfig } from "motion/react"
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom"

import { AppShell } from "@/components/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { StoreProvider, useStore } from "@/lib/store"
import { AlertsPage } from "@/pages/alerts"
import { HomePage } from "@/pages/home"
import { HostsPage } from "@/pages/hosts"
import { LoginPage } from "@/pages/login"
import { OverviewPage } from "@/pages/overview"
import { PortsPage } from "@/pages/ports"
import { ProcessesPage } from "@/pages/processes"
import { ImagesPage, NetworksPage, VolumesPage } from "@/pages/resources"
import { ServiceDetailPage } from "@/pages/service-detail"
import { ServicesPage } from "@/pages/services"
import { SettingsPage } from "@/pages/settings"
import { UpdatesPage } from "@/pages/updates"

function RequireAuth() {
  const { authed, ready, setupRequired } = useStore()
  if (!ready) return null
  if (setupRequired) return <Navigate to="/login?setup=1" replace />
  return authed ? <Outlet /> : <Navigate to="/login" replace />
}

export function App() {
  return (
    <StoreProvider>
      <TooltipProvider delayDuration={300}>
        <MotionConfig
          reducedMotion="user"
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="home" element={<HomePage />} />
                  <Route path="hosts" element={<HostsPage />} />
                  <Route path="services" element={<ServicesPage />} />
                  <Route path="services/:id" element={<ServiceDetailPage />} />
                  <Route path="updates" element={<UpdatesPage />} />
                  <Route path="ports" element={<PortsPage />} />
                  <Route path="processes" element={<ProcessesPage />} />
                  <Route path="alerts" element={<AlertsPage />} />
                  <Route path="images" element={<ImagesPage />} />
                  <Route path="networks" element={<NetworksPage />} />
                  <Route path="volumes" element={<VolumesPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </MotionConfig>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </StoreProvider>
  )
}

export default App
