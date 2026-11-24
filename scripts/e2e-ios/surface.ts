// Drives one web view in the simulator (the native app's or a Safari tab) like a user would:
// navigate, fill fields, tap buttons, and wait for what appears on screen.
import type { Inspector, PageSession, WebPage } from './inspector'
import type { Simulator } from './simulator'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Runs before every snippet. Native dialogs would block the page (and this driver), so they
// are answered and recorded; API responses are recorded so steps can assert on them.
const PRELUDE = `
const $$ = (s) => [...document.querySelectorAll(s)];
const norm = (s) => String(s || '').trim().replace(/\\s+/g, ' ');
const text = () => document.body ? document.body.innerText : '';
const setv = (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const tap = (label) => {
  const els = $$('button,a,[role=button]').filter((e) => !e.disabled);
  const el = els.find((e) => norm(e.innerText) === label) || els.find((e) => norm(e.innerText).startsWith(label));
  if (!el) throw new Error('No button or link labelled "' + label + '"');
  el.click();
  return true;
};
// React has attached to the server-rendered page (before that, typing and taps are lost).
const hydrated = () => Object.keys(document.body || {}).some((k) => k.startsWith('__react'));
const toasts = () => $$('[data-sonner-toast]').map((e) => norm(e.innerText));
if (!window.__e2e) {
  window.__e2e = { calls: [], dialogs: [] };
  window.alert = (m) => { window.__e2e.dialogs.push(String(m)); };
  window.confirm = (m) => { window.__e2e.dialogs.push(String(m)); return true; };
  window.prompt = (m) => { window.__e2e.dialogs.push(String(m)); return 'DELETE'; };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await realFetch(...args);
    const url = String(args[0] && args[0].url ? args[0].url : args[0]);
    response.clone().text().then((body) => window.__e2e.calls.push({ url, status: response.status, body: body.slice(0, 600) })).catch(() => {});
    return response;
  };
}
const e2e = window.__e2e;
const call = (name) => e2e.calls.filter((c) => c.url.includes('/api/commands/' + name)).at(-1) || null;
`

export interface WaitOptions { timeoutMs?: number }

export class Surface {
  private session: PageSession | null = null

  constructor(
    readonly name: 'app' | 'safari',
    private readonly sim: Simulator,
    private readonly inspector: Inspector,
    private readonly baseUrl: string,
    private readonly bundleId: string,
  ) {}

  /** Runs a snippet (a function body that returns a value) in the page. */
  async run<T = unknown>(body: string, timeoutMs = 4000): Promise<T> {
    const session = this.session ?? (await this.connect())
    if (!session) throw new Error(`no ${this.name} page is showing ${this.baseUrl}`)
    const json = await session.evaluate(`JSON.stringify((() => { ${PRELUDE}\n${body}\n})() ?? null)`, timeoutMs)
    return JSON.parse(String(json)) as T
  }

  /** Polls a snippet until it returns something truthy. Pages don't answer while they load. */
  async waitFor<T = unknown>(what: string, body: string, { timeoutMs = 90_000 }: WaitOptions = {}): Promise<T> {
    const deadline = Date.now() + timeoutMs
    let last: unknown = null
    let misses = 0
    while (Date.now() < deadline) {
      try {
        const value = await this.run<T>(body, 3000)
        misses = 0
        if (value) return value
        last = value
      } catch (error) {
        last = error instanceof Error ? error.message : error
        // A long silence can mean the web view was replaced; attach to it again.
        if (++misses % 8 === 0) this.close()
      }
      await sleep(600)
    }
    throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what} (last: ${JSON.stringify(last)?.slice(0, 200)})`)
  }

  /** Navigates to a path and waits until the new page has loaded. */
  async goto(path: string): Promise<void> {
    const url = new URL(path, this.baseUrl).toString()
    const session = this.session ?? (await this.connect())
    if (!session && this.name === 'safari') {
      await this.sim.openUrl(url)
    } else {
      await this.run(`window.__e2eLeaving = location.href; location.assign(${JSON.stringify(url)}); return true`)
    }
    await this.waitForNewPage(`${path} to load`)
  }

  /** Waits for a page that has finished loading since the last action that navigated. */
  waitForNewPage(what: string, options?: WaitOptions): Promise<string> {
    return this.waitFor<string>(what, `const from = window.__e2eLeaving; return document.readyState === 'complete' && text().length > 0 && hydrated() && (!from || location.href !== from) ? location.pathname + location.search : null`, options)
  }

  /** Taps a button that navigates, then waits for the next page. */
  async tapAndWait(label: string, what: string, options?: WaitOptions): Promise<string> {
    await this.run(`window.__e2eLeaving = location.href; return tap(${JSON.stringify(label)})`)
    return this.waitForNewPage(what, options)
  }

  /** Signs in through the dev sign-in endpoint (the login form itself is covered by its own step). */
  async signInAs(email: string): Promise<void> {
    await this.run(`window.__e2eLeaving = location.href; fetch('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(email)} }) }).then(() => location.assign('/today')); return true`)
    await this.waitForNewPage(`sign-in as ${email}`)
  }

  async signOut(): Promise<void> {
    await this.run(`window.__e2eLeaving = location.href; fetch('/api/auth/signout', { method: 'POST' }).then(() => location.assign('/login')); return true`)
    await this.waitForNewPage('sign-out')
  }

  /** Waits until this surface shows a page from the test server. */
  async attach(timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    let seen: string[] = []
    while (Date.now() < deadline) {
      if (await this.connect()) {
        await this.waitFor('the first page to finish loading', `return document.readyState === 'complete' && text().length > 0 && hydrated()`, { timeoutMs: Math.max(deadline - Date.now(), 30_000) })
        return
      }
      seen = (await this.inspector.pages()).map((p) => `${p.bundleId} ${p.url}`)
      await sleep(1000)
    }
    throw new Error(`The ${this.name} never showed ${this.baseUrl}. Web views seen: ${seen.join(', ') || 'none'}`)
  }

  close(): void {
    this.session?.close()
    this.session = null
  }

  /** Attaches to the page showing the test server (the most recent one, for Safari tabs). */
  private async connect(): Promise<PageSession | null> {
    const pages = (await this.inspector.pages()).filter((p) => p.bundleId === this.bundleId && p.url.startsWith(this.baseUrl))
    const page: WebPage | undefined = pages.sort((a, b) => a.pageId - b.pageId).at(-1)
    if (!page) return null
    this.session?.close()
    this.session = this.inspector.openSession(page)
    return this.session
  }
}
