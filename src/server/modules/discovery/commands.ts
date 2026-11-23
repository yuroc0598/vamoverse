import { command } from '../../commands/define'
import { findInput, findProviders, findSessions } from './discovery'

export const discoveryCommands = {
  'find.providers': command({
    summary: 'Find coaches and paid hitting partners (optionally by type, area, or name), soonest availability first.',
    access: 'public',
    mutates: false,
    input: findInput,
    run: ({ db }, input) => findProviders(db, input),
  }),

  'find.sessions': command({
    summary: 'Find open group clinics in the next two weeks (optionally by area or keyword).',
    access: 'public',
    mutates: false,
    input: findInput,
    run: ({ db }, input) => findSessions(db, input),
  }),
}
