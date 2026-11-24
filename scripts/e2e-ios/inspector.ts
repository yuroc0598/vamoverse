// Minimal client for the iOS Simulator's Web Inspector: the same channel Safari's Develop
// menu uses. It lists web views (Safari tabs, the app's WKWebView) and runs JavaScript in them.
// Wire format: 4-byte big-endian length + binary plist; page traffic is JSON inside the plist.
// The simulator's inspector daemon copes badly with connections opening and closing quickly,
// so one connection carries everything for the whole run, as Safari's own inspector does.
import { randomUUID } from 'node:crypto'
import net from 'node:net'
import bplistCreator from 'bplist-creator'
import { parseBuffer } from 'bplist-parser'

type Dict = Record<string, unknown>
interface Message { __selector: string; __argument: Dict }
interface Reply { id: number; result?: { result?: { value?: unknown; description?: string }; wasThrown?: boolean }; error?: { message: string } }

export interface WebPage {
  appId: string
  bundleId: string
  pageId: number
  url: string
}

class InspectorTimeout extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class Inspector {
  private readonly id = randomUUID()
  private buffer = Buffer.alloc(0)
  private readonly bundles = new Map<string, string>()
  private readonly listings = new Map<string, WebPage[]>()
  private readonly sessions = new Map<string, PageSession>()

  private constructor(private readonly socket: net.Socket) {
    socket.on('data', (chunk) => this.receive(chunk))
    socket.on('error', () => undefined)
  }

  static connect(socketPath: string): Promise<Inspector> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath)
      socket.setTimeout(5000, () => socket.destroy(new InspectorTimeout('the Web Inspector socket did not accept a connection')))
      socket.once('error', reject)
      socket.once('connect', () => {
        socket.setTimeout(0)
        const inspector = new Inspector(socket)
        inspector.send('_rpc_reportIdentifier:', {})
        inspector.send('_rpc_getConnectedApplications:', {})
        resolve(inspector)
      })
    })
  }

  /** Web views as last reported; asks for fresh listings and waits briefly for them. */
  async pages(waitMs = 800): Promise<WebPage[]> {
    for (const appId of this.bundles.keys()) this.send('_rpc_forwardGetListing:', { WIRApplicationIdentifierKey: appId })
    await sleep(waitMs)
    return [...this.listings.entries()].flatMap(([appId, pages]) => pages.map((p) => ({ ...p, bundleId: this.bundles.get(appId) ?? '' })))
  }

  /** Attaches a debugging session to a page (reused for every evaluation on it). */
  openSession(page: WebPage): PageSession {
    const sender = randomUUID()
    const session = new PageSession(this, page, sender)
    this.sessions.set(sender, session)
    return session
  }

  closeSession(sender: string, route: Dict): void {
    if (!this.sessions.delete(sender)) return
    this.send('_rpc_forwardDidClose:', route)
  }

  close(): void {
    this.socket.destroy()
  }

  send(selector: string, argument: Dict): void {
    const body = bplistCreator({ __selector: selector, __argument: { WIRConnectionIdentifierKey: this.id, ...argument } })
    const header = Buffer.alloc(4)
    header.writeUInt32BE(body.length)
    this.socket.write(Buffer.concat([header, body]))
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32BE(0)
      if (this.buffer.length < 4 + size) return
      const [message] = parseBuffer<Message>(this.buffer.subarray(4, 4 + size))
      this.buffer = this.buffer.subarray(4 + size)
      this.handle(message)
    }
  }

  private handle({ __selector: selector, __argument: arg }: Message): void {
    const appId = String(arg.WIRApplicationIdentifierKey ?? '')
    switch (selector) {
      case '_rpc_reportConnectedApplicationList:':
        for (const [id, app] of Object.entries(arg.WIRApplicationDictionaryKey as Record<string, Dict>)) this.addApp(id, app)
        break
      case '_rpc_applicationConnected:':
      case '_rpc_applicationUpdated:':
        this.addApp(appId, arg)
        break
      case '_rpc_applicationDisconnected:':
        this.bundles.delete(appId)
        this.listings.delete(appId)
        break
      case '_rpc_applicationSentListing:':
        this.listings.set(appId, Object.values(arg.WIRListingKey as Record<string, Dict>)
          .filter((p) => String(p.WIRTypeKey).includes('Web'))
          .map((p) => ({ appId, bundleId: '', pageId: Number(p.WIRPageIdentifierKey), url: String(p.WIRURLKey ?? '') })))
        break
      case '_rpc_applicationSentData:': {
        const raw = arg.WIRMessageDataKey
        this.sessions.get(String(arg.WIRDestinationKey))?.receive(JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)))
        break
      }
    }
  }

  private addApp(appId: string, app: Dict): void {
    const bundle = app.WIRApplicationBundleIdentifierKey
    if (bundle) this.bundles.set(appId, String(bundle))
    else if (!this.bundles.has(appId)) this.bundles.set(appId, '')
    this.send('_rpc_forwardGetListing:', { WIRApplicationIdentifierKey: appId })
  }
}

/** A debugging session on one page. Navigations swap the page's inspector target; it follows them. */
export class PageSession {
  private target: string | null = null
  private nextId = 1
  private readonly pending = new Map<number, (reply: Reply) => void>()
  private readonly route: Dict

  constructor(private readonly inspector: Inspector, readonly page: WebPage, private readonly sender: string) {
    this.route = { WIRApplicationIdentifierKey: page.appId, WIRPageIdentifierKey: page.pageId, WIRSenderKey: sender }
    inspector.send('_rpc_forwardSocketSetup:', { ...this.route, WIRAutomaticallyPause: false })
  }

  receive(data: { method?: string; params?: Dict }): void {
    const params = data.params ?? {}
    if (data.method === 'Target.targetCreated') {
      const info = params.targetInfo as Dict
      if (!info.isProvisional) this.target = String(info.targetId)
    } else if (data.method === 'Target.didCommitProvisionalTarget') {
      this.target = String(params.newTargetId)
    } else if (data.method === 'Target.targetDestroyed' && params.targetId === this.target) {
      this.target = null
    } else if (data.method === 'Target.dispatchMessageFromTarget') {
      const reply = JSON.parse(String(params.message)) as Reply
      this.pending.get(reply.id)?.(reply)
      this.pending.delete(reply.id)
    }
  }

  /** Evaluates a synchronous expression in the page and returns its JSON-serializable value. */
  async evaluate(expression: string, timeoutMs: number): Promise<unknown> {
    const deadline = Date.now() + timeoutMs
    while (!this.target) {
      if (Date.now() > deadline) throw new InspectorTimeout('the page has no inspector target yet')
      await sleep(100)
    }
    const id = this.nextId++
    const target = this.target
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new InspectorTimeout(`page did not answer within ${timeoutMs}ms`))
      }, Math.max(deadline - Date.now(), 100))
      this.pending.set(id, (reply) => {
        clearTimeout(timer)
        const result = reply.result?.result
        if (reply.error) reject(new Error(reply.error.message))
        else if (reply.result?.wasThrown) reject(new Error(String(result?.description ?? 'script error')))
        else resolve(result?.value)
      })
      const request = { id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, emulateUserGesture: true } }
      this.inspector.send('_rpc_forwardSocketData:', {
        ...this.route,
        WIRSocketDataKey: Buffer.from(JSON.stringify({ id, method: 'Target.sendMessageToTarget', params: { targetId: target, message: JSON.stringify(request) } })),
      })
    })
  }

  close(): void {
    this.inspector.closeSession(this.sender, this.route)
  }
}
