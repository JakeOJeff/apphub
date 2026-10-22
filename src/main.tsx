import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AppStateProvider } from './state/AppState'
import { AppShell } from './components/layout/AppShell'
import { GrowthLayout } from './pages/growth/GrowthLayout'
import { GrowthOverview } from './pages/growth/Overview'
import { AttributionTab, CampaignsTab, CouponsTab, DataSetupTab, DeepLinksTab, ReferralsTab } from './pages/growth/Tabs'
import { PlaceholderPage } from './pages/Placeholder'
import { AppsPage } from './pages/Apps'
import { DatabasePage } from './pages/DatabasePage'
import { TeamPage } from './pages/Team'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/growth" replace />} />
            <Route path="growth" element={<GrowthLayout />}>
              <Route index element={<GrowthOverview />} />
              <Route path="links" element={<DeepLinksTab />} />
              <Route path="coupons" element={<CouponsTab />} />
              <Route path="referrals" element={<ReferralsTab />} />
              <Route path="campaigns" element={<CampaignsTab />} />
              <Route path="attribution" element={<AttributionTab />} />
              <Route path="setup" element={<DataSetupTab />} />
            </Route>
            <Route path="apps" element={<AppsPage />} />
            <Route path="database" element={<DatabasePage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="*" element={<PlaceholderPage />} />
          </Route>
        </Routes>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
)
