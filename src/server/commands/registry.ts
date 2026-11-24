// Every command in the product. Add a module's commands here once.
import type { z } from 'zod'
import { assistantCommands } from '../modules/assistant/commands'
import { bookingCommands } from '../modules/bookings/commands'
import { clientCommands } from '../modules/clients/commands'
import { discoveryCommands } from '../modules/discovery/commands'
import { messagingCommands } from '../modules/messaging/commands'
import { notificationCommands } from '../modules/notifications/commands'
import { packageCommands } from '../modules/packages/commands'
import { paymentCommands } from '../modules/payments/commands'
import { providerCommands } from '../modules/providers/commands'
import { scheduleCommands } from '../modules/schedule/commands'
import { userCommands } from '../modules/users/commands'

export const commands = {
  ...userCommands,
  ...providerCommands,
  ...scheduleCommands,
  ...bookingCommands,
  ...paymentCommands,
  ...packageCommands,
  ...clientCommands,
  ...notificationCommands,
  ...messagingCommands,
  ...discoveryCommands,
  ...assistantCommands,
}

type Commands = typeof commands
export type CommandName = keyof Commands
export type CommandInput<N extends CommandName> = z.input<Commands[N]['input']>
export type CommandOutput<N extends CommandName> = Awaited<ReturnType<Commands[N]['run']>>
