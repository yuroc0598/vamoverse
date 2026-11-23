// Page-level guards for server components.
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { AppError } from '../errors'
import type { ProviderActor } from '../commands/define'
import type { Actor } from '../modules/users/accounts'
import { currentActor } from './session'

async function currentPath(): Promise<string> {
  return (await headers()).get('x-pathname') || '/today'
}

export async function requireSignedIn(): Promise<Actor> {
  const actor = await currentActor()
  if (!actor) redirect(`/login?next=${encodeURIComponent(await currentPath())}`)
  return actor
}

export async function requireOnboarded(): Promise<Actor> {
  const actor = await requireSignedIn()
  if (!actor.onboarded) redirect(`/onboarding?next=${encodeURIComponent(await currentPath())}`)
  return actor
}

export async function requireProviderPage(): Promise<ProviderActor> {
  const actor = await requireOnboarded()
  if (!actor.providerId) redirect('/settings/business')
  return actor as ProviderActor
}

/** Resolves the value, or renders the 404 page when the command reports not_found. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') notFound()
    throw error
  }
}
