// Turns pasted text (one person per line, from a spreadsheet, CSV, or phone contacts)
// into contact rows. Each line needs a name and an email and/or phone, in any order.
export interface ContactRow { name: string; email: string | null; phone: string | null }

const EMAIL = /[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/
const PHONE = /\+?\(?\d[\d\s().-]{8,}\d/

export function parseContacts(text: string): { rows: ContactRow[]; skipped: string[] } {
  const rows: ContactRow[] = []
  const skipped: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^name\b/i.test(line)) continue // blank lines and header rows
    const email = line.match(EMAIL)?.[0] ?? null
    const phone = line.replace(EMAIL, ' ').match(PHONE)?.[0]?.trim() ?? null
    const name = line.replace(EMAIL, ' ').replace(PHONE, ' ').split(/[,;\t]/).map((p) => p.replace(/["<>]/g, '').trim()).filter(Boolean).join(' ').trim()
    if (name && (email || phone)) rows.push({ name, email, phone })
    else skipped.push(line)
  }
  return { rows, skipped }
}
