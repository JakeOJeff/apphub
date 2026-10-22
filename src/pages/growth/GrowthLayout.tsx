import { Link, NavLink, Outlet } from 'react-router-dom'
import { ChevronDown, Database, Download, Link2, Megaphone, Plus, TicketPercent, Users } from 'lucide-react'
import { ranges } from '../../data/mock'
import { useAppState } from '../../state/AppState'
import { cn } from '../../lib/format'
import { Button, Menu, MenuItem, Segmented } from '../../components/ui'

export const growthTabs = [
  { to: '', label: 'Overview' },
  { to: 'links', label: 'Deep links' },
  { to: 'coupons', label: 'Coupons' },
  { to: 'referrals', label: 'Referrals' },
  { to: 'campaigns', label: 'Campaigns' },
  { to: 'attribution', label: 'Attribution' },
  { to: 'setup', label: 'Data & setup' },
]

export function GrowthLayout() {
  const { app, range, setRange, toast } = useAppState()

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Growth</h1>
          <p className="mt-1 text-[13px] text-muted">
            Links, coupons, referrals and campaigns for {app.name}, traced from first click to revenue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={range} onChange={setRange} options={ranges} />
          <Button onClick={() => toast('Exporting CSV…')}>
            <Download size={14} /> Export
          </Button>
          <Menu
            width="w-48"
            trigger={({ toggle }) => (
              <Button variant="primary" onClick={toggle}>
                <Plus size={14} /> Create <ChevronDown size={13} />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<Link2 size={14} />} onClick={() => { close(); toast('New deep link') }}>Deep link</MenuItem>
                <MenuItem icon={<TicketPercent size={14} />} onClick={() => { close(); toast('New coupon') }}>Coupon</MenuItem>
                <MenuItem icon={<Users size={14} />} onClick={() => { close(); toast('New referral program') }}>Referral program</MenuItem>
                <MenuItem icon={<Megaphone size={14} />} onClick={() => { close(); toast('New campaign') }}>Campaign</MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      {!app.demo && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card-2 px-3 py-2 text-xs text-muted">
          <Database size={13} className="text-subtle" />
          Data sources are connected. These metrics are still placeholders until your tables are mapped to them.
          <Link to="/database" className="ml-auto font-medium text-fg hover:underline">
            Browse tables →
          </Link>
        </div>
      )}

      <nav className="mt-5 flex gap-5 overflow-x-auto border-b border-line">
        {growthTabs.map((t) => (
          <NavLink
            key={t.label}
            to={t.to}
            end
            className={({ isActive }) =>
              cn(
                '-mb-px shrink-0 border-b-2 pb-2.5 text-[13px] transition-colors',
                isActive ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="pt-5">
        <Outlet />
      </div>
    </div>
  )
}
