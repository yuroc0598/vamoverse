import { describe, expect, it } from 'vitest'
import { parseContacts } from '@/lib/contacts'

describe('parseContacts', () => {
  it('reads names with emails and/or phones in any order and skips headers and incomplete lines', () => {
    const { rows, skipped } = parseContacts([
      'Name,Email,Phone',
      'Maya Chen, maya@example.com, (415) 555-0100',
      'sam@example.com\tSam Lee',
      '"Leo Park" <leo@example.com>',
      '+1 650 555 0123 Ana Ruiz',
      'Just A Name',
      '',
    ].join('\n'))
    expect(rows).toEqual([
      { name: 'Maya Chen', email: 'maya@example.com', phone: '(415) 555-0100' },
      { name: 'Sam Lee', email: 'sam@example.com', phone: null },
      { name: 'Leo Park', email: 'leo@example.com', phone: null },
      { name: 'Ana Ruiz', email: null, phone: '+1 650 555 0123' },
    ])
    expect(skipped).toEqual(['Just A Name'])
  })
})
