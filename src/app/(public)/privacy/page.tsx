export const metadata = { title: 'Privacy · Vamoverse' }

export default function PrivacyPage() {
  return (
    <article className="max-w-none space-y-4 text-sm">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="rounded-lg bg-amber-50 p-3">Draft for legal review before launch.</p>
      <h2 className="font-semibold">What we collect</h2>
      <p>Your name, email and/or phone number, bookings and payments, messages with your coaches, and the tennis details you choose to add (ratings, gender for gendered sessions). Card details are held by Stripe, not by us.</p>
      <h2 className="font-semibold">Juniors</h2>
      <p>Players under 18 never sign in. A parent or guardian creates their profile, signs a consent, books for them, and receives every message about them. Coaches cannot message a junior directly. Parents can remove a junior and their data at any time from Settings → Family.</p>
      <h2 className="font-semibold">How we use it</h2>
      <p>To run bookings, payments, reminders, and messages, and to show providers who is booked. We share booking details with the provider you book and payment details with Stripe. We don’t sell personal information.</p>
      <h2 className="font-semibold">The assistant</h2>
      <p>When you use the assistant, your messages and the account data needed to answer them are processed by Anthropic to generate replies. The assistant can only take actions you confirm.</p>
      <h2 className="font-semibold">Your choices</h2>
      <p>Turn email or text notifications on or off in Settings. Delete your account from Settings → Profile; payment records are kept for accounting without your personal details.</p>
      <h2 className="font-semibold">Contact</h2>
      <p>privacy@vamoverse.app</p>
    </article>
  )
}
