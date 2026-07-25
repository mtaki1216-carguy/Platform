import { useTeamData } from '../data/DataProvider'
import { useLocalState } from './useLocalState'

/**
 * 「この端末を使っているのは誰か」。
 * 共有アカウントでログインするので誰が操作しているかは DB からは分からない。
 * フォームの初期値をこの人にしておくと入力が1手減る。
 */
export function useSelfMember() {
  const { members } = useTeamData()
  const [selfId, setSelfId] = useLocalState<string>('self-member-id', '')

  // 保存されている ID がもう存在しない場合は未設定として扱う
  const valid = members.some((m) => m.id === selfId) ? selfId : ''
  return { selfId: valid, setSelfId, selfName: members.find((m) => m.id === valid)?.name ?? null }
}
