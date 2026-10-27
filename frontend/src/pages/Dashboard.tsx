import { Link } from 'react-router-dom'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Banner, Card, Empty, Tile } from '../components/ui'
import { IconBalance, IconCoins, IconHandCoins } from '../components/icons'
import { BalanceChart } from '../charts/BalanceChart'
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
  const { summary, monthly, races, maintenance, expenses, memberName } = useTeamData()
  const { selfName, selfId } = useSelfMember()

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
  const owed = summary.byMember.filter((m) => m.unsettled > 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ダッシュボード</h1>
          <p>
            {selfName ? `${selfName}さん、` : ''}
            チームの残高・直近のレース・整備状況をまとめて表示します。
          </p>
        </div>
      </div>

      <div className="stack">
        {summary.projectedBalance < 0 ? (
          <Banner tone="critical">
            <strong>実質残高がマイナスです。</strong> 立替を全額返すと {formatYen(-summary.projectedBalance)}{' '}
            足りません。<Link to="/budget">予算管理</Link>で精算すると、不足ぶんを全員で均等に集められます。
          </Banner>
        ) : null}

        {deadlines.length > 0 ? (
          <Banner tone="warning">
            <strong>申込締切が近いレースがあります。</strong>{' '}
            {deadlines
              .map((r) => `${r.name}（${formatDate(r.entry_deadline)}・${formatRelativeDays(r.entry_deadline)}）`)
              .join('、')}
            。<Link to="/races">レース管理</Link>で申込状況を更新してください。
          </Banner>
        ) : null}

        {/* 口座残高 − 未精算の立替 = 実質残高。主役は実質残高（返す予定のお金を引いた、使える額） */}
        <div className="grid grid--tiles">
          <Tile
            tone="primary"
            icon={<IconBalance />}
            value={formatYen(summary.projectedBalance)}
            label="実質残高"
            note="口座残高 − 未精算の立替"
          />
          <Tile
            tone="secondary"
            icon={<IconCoins />}
            value={formatYen(summary.teamBalance)}
            label="口座残高"
            note="チーム口座にいまあるお金"
          />
          <Tile
            tone="plain"
            icon={<IconHandCoins />}
            value={formatYen(summary.unsettledTotal)}
            label="未精算の立替"
            note="立て替えた人に返す予定"
          />
        </div>

        {owed.length > 0 ? (
          <Card
            title="返す予定の立替"
            subtitle="立て替えた人ごとの、まだ返していない額"
            flush
            actions={
              <Link className="btn btn--sm btn--primary" to="/budget">
                精算する
              </Link>
            }
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>メンバー</th>
                    <th className="num">件数</th>
                    <th className="num">返す額</th>
                  </tr>
                </thead>
                <tbody>
                  {owed.map((row) => (
                    <tr key={row.member.id}>
                      <td className="nowrap">
                        {row.member.name}
                        {row.member.id === selfId ? (
                          <span className="sub">
                            <Badge tone="info">自分</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td className="num">{row.unsettledCount}</td>
                      <td className="num">{formatYen(row.unsettled)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        <Card title="口座残高の推移" subtitle="各月末時点の口座残高">
          <BalanceChart data={monthly} />
        </Card>

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

        <Card
          title="最近の支出"
          flush
          actions={
            <Link className="btn btn--sm" to="/budget">
              予算管理へ
            </Link>
          }
        >
          {expenses.length === 0 ? (
            <Empty title="支出の記録がありません" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>支払日</th>
                    <th>内容</th>
                    <th>支払元</th>
                    <th className="num">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.slice(0, 8).map((e) => (
                    <tr key={e.id}>
                      <td className="nowrap">{formatDate(e.occurred_on)}</td>
                      <td>
                        {e.description}
                        {e.recurrence === 'monthly' ? (
                          <span className="sub">
                            <Badge tone="warning">固定費 毎月{e.payment_day}日</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td className="nowrap">
                        {e.payer_type === 'team' ? (
                          <Badge tone="neutral">チーム口座</Badge>
                        ) : e.reimbursed ? (
                          <Badge tone="good">{memberName(e.paid_by)} 立替・精算済</Badge>
                        ) : (
                          <Badge tone="warning">{memberName(e.paid_by)} 立替・未精算</Badge>
                        )}
                      </td>
                      <td className="num">{formatYen(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
