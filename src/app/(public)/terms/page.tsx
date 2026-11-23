export const metadata = { title: 'Terms · Vamoverse' }

export default function TermsPage() {
  return (
    <article className="prose prose-sm max-w-none space-y-4 text-sm">
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <p className="rounded-lg bg-amber-50 p-3">Draft for legal review before launch.</p>
      <h2 className="font-semibold">What Vamoverse is</h2>
      <p>Vamoverse is software that independent tennis coaches and hitting partners (“providers”) use to schedule sessions, take bookings and payments, and communicate with the people they teach. Providers, not Vamoverse, deliver the sessions and are responsible for them.</p>
      <h2 className="font-semibold">Accounts</h2>
      <p>You must be 18 or older to create an account. Parents and guardians add and manage players under 18; juniors do not have their own logins. Keep your sign-in method secure.</p>
      <h2 className="font-semibold">Bookings, payments, and cancellations</h2>
      <p>Each provider sets their prices and cancellation, late-cancel, and no-show policy, which are shown before you book and applied automatically. Card payments are processed by Stripe and paid to the provider. When a provider cancels a session you are refunded in full or your package credit is returned.</p>
      <h2 className="font-semibold">Fees</h2>
      <p>Providers on the Free plan pay a platform fee on each card payment; providers on Pro pay a monthly subscription and no platform fee. Card processing fees apply on both plans.</p>
      <h2 className="font-semibold">Assumption of risk</h2>
      <p>Tennis is a physical activity with a risk of injury. You (or, for a junior, the parent or guardian) accept that risk when booking a session and should follow the provider’s and venue’s safety guidance.</p>
      <h2 className="font-semibold">Acceptable use</h2>
      <p>Don’t misuse the service, harass others, or send messages to people who haven’t booked with you or joined your crew. We may suspend accounts that break these rules.</p>
      <h2 className="font-semibold">Contact</h2>
      <p>hello@vamoverse.app</p>
    </article>
  )
}
