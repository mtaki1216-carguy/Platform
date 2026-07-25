import { useCallback, useEffect, useState } from 'react'

/**
 * localStorage に載る useState。
 * 「自分は誰か（フォームの初期値に使う）」や絞り込み条件の記憶に使う。
 */
export function useLocalState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // プライベートモードなどで書けなくても機能自体は動くので黙って続ける
    }
  }, [key, value])

  const set = useCallback((next: T) => setValue(next), [])
  return [value, set]
}
