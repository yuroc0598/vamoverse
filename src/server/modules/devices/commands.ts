import { z } from 'zod'
import { command } from '../../commands/define'
import { deviceToken, registerDevice, registerInput, unregisterDevice } from './devices'

export const deviceCommands = {
  'devices.register': command({
    summary: 'Receive push notifications on this device (the native app sends its APNs token after you allow notifications).',
    access: 'user',
    mutates: true,
    assistant: false,
    input: registerInput,
    run: async ({ actor, db }, input) => {
      await registerDevice(db, actor.userId, input)
      return { registered: true }
    },
  }),

  'devices.unregister': command({
    summary: 'Stop push notifications on this device (on sign-out).',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({ token: deviceToken }),
    run: async ({ actor, db }, { token }) => ({ removed: await unregisterDevice(db, actor.userId, token) }),
  }),
}
