// iCalendar (RFC 5545) invite for a session, so bookings land in Google/Apple/Outlook calendars.
import type { SessionView } from '../schedule/sessions'

function stamp(date: Date | string): string {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
}

/** Lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const out: string[] = []
  for (let i = 0; i < line.length; i += 73) out.push((i ? ' ' : '') + line.slice(i, i + 73))
  return out.join('\r\n')
}

export function sessionInvite(session: SessionView, opts: { uid: string; url: string; cancelled?: boolean }): string {
  const location = [session.locationName, session.locationAddress].filter(Boolean).join(', ')
  const description = [session.locationNote, session.note, `Manage: ${opts.url}`].filter(Boolean).join('\n')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vamoverse//Sessions//EN', 'CALSCALE:GREGORIAN',
    `METHOD:${opts.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${opts.uid}@vamoverse.app`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(session.startsAt)}`,
    `DTEND:${stamp(session.endsAt)}`,
    `SUMMARY:${escape(`${session.title} · ${session.providerName}`)}`,
    location && `LOCATION:${escape(location)}`,
    `DESCRIPTION:${escape(description)}`,
    `URL:${opts.url}`,
    `STATUS:${opts.cancelled || session.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${escape(session.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean) as string[]
  return lines.map(fold).join('\r\n') + '\r\n'
}
