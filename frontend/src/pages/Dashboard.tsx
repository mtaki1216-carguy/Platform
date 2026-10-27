import { Link } from 'react-router-dom'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Banner, Card, Empty, Tile } from '../components/ui'
import { IconCoins } from '../components/icons'
import { VehicleStatusCard } from '../components/VehicleStatusCard'
import {
  daysFromToday,
  formatDate,
  formatDateRange,
  formatNumber,
  formatRelativeDays,
  formatYen,
  today,
} from '../lib/format'
import { MAINTENANCE_CATEGORIES, RACE_STATUSES, RACE_STATUS_TONE, type RaceStatus } from '../lib/types'

const OPEN_STATUSES: RaceStatus[] = ['considering', 'planned']

export function Dashboard() {
  const { summary, races, maintenance } = useTeamData()
  const { selfName } = useSelfMember()

  const now = today()
  const upcoming = races
    .filter((r) => (r.ends_on ?? r.starts_on) >= now && r.status !== 'declined' && r.status !== 'cancelled')
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .slice(0, 5)

  const deadlines = races
    .filter((r) => r.entry_deadline && OPEN_STATUSES.includes(r.status))
    .filter((r) => daysFromToday(r.entry_deadline!) <= 21)
    .sort((a, b) => a.entry_deadline!.localeCompare(b.entry_deadline!))

  const recentMaintenance = maintenance.slice(0, 5)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ダッシュボード</h1>
          <p>
            {selfName ? `${selfName}さん、` : ''}
            車両の状態・チームの残高・直近のレース・整備状況をまとめて表示します。
          </p>
        </div>
      </div>

      <div className="stack">
        {deadlines.length > 0 ? (
          <Banner tone="warning">
            <strong>申込締切が近いレースがあります。</strong>{' '}
            {deadlines
              .map((r) => `${r.name}（${formatDate(r.entry_deadline)}・${formatRelativeDays(r.entry_deadline)}）`)
              .join('、')}
            。<Link to="/races">レース管理</Link>で申込状況を更新してください。
          </Banner>
        ) : null}

        {/* 車両の状態を先に、そのとなりに現在の残高。予算まわりの数字はこの1つだけ */}
        <div className="dash-top">
          <VehicleStatusCard />
          <Tile
            tone="primary"
            icon={<IconCoins />}
            value={formatYen(summary.teamBalance)}
            label="現在の残高"
            note={
              summary.unsettledTotal > 0
                ? `返す予定の立替 ${formatYen(summary.unsettledTotal)} を引くと ${formatYen(summary.projectedBalance)}`
                : 'チーム口座にあるお金'
            }
          />
        </div>

        <div className="grid grid--two">
          <Card
            title="次のレース"
            flush
            actions={
              <Link className="btn btn--sm" to="/races">
                一覧を見る
              </Link>
            }
          >
            {upcoming.length === 0 ? (
              <Empty title="予定されているレースがありません" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>レース</th>
                      <th>開催日</th>
                      <th>申込状況</th>
                      <th className="num">参加費</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.name}
                          {r.circuit ? <span className="sub">{r.circuit}</span> : null}
                        </td>
                        <td className="nowrap">
                          {formatDateRange(r.starts_on, r.ends_on)}
                          <span className="sub">{formatRelativeDays(r.starts_on)}</span>
                        </td>
                        <td className="nowrap">
                          <Badge tone={RACE_STATUS_TONE[r.status]}>{RACE_STATUSES[r.status]}</Badge>
                        </td>
                        <td className="num">
                          {r.entry_fee > 0 ? formatYen(r.entry_fee) : '—'}
                          {r.entry_fee > 0 && !r.fee_paid ? <span className="sub">未払い</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="最近の整備"
            flush
            actions={
              <Link className="btn btn--sm" to="/maintenance">
                一覧を見る
              </Link>
            }
          >
            {recentMaintenance.length === 0 ? (
              <Empty title="整備記録がありません" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>実施日</th>
                      <th>内容</th>
                      <th className="num">走行距離</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMaintenance.map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap">{formatDate(m.performed_on)}</td>
                        <td>
                          {m.title}
                          <span className="sub">{MAINTENANCE_CATEGORIES[m.category]}</span>
                        </td>
                        <td className="num">
                          {m.odometer_km != null ? `${formatNumber(m.odometer_km)} km` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
