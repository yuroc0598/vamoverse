import { randomUUID } from 'crypto'

export type IdPrefix =
  | 'usr' | 'ply' | 'pro' | 'crt' | 'off' | 'ses' | 'bkg' | 'pay' | 'pkg' | 'pkp' | 'csn'
  | 'cnv' | 'msg' | 'ntf' | 'asm' | 'act' | 'ath'

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`
}
