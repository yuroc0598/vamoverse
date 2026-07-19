// Mock engine for Vamos when no OpenAI key - regex based intent parser + tool calling simulation

type MockIntent = 
  | 'list_events'
  | 'search_players'
  | 'list_payments'
  | 'create_match_draft'
  | 'create_payment_draft'
  | 'general_chat'

interface ParsedIntent {
  intent: MockIntent
  entities: any
  confidence: number
}

export function parseIntent(message: string): ParsedIntent {
  const lower = message.toLowerCase()
  
  // Event/schedule intents
  if (
    lower.includes('next lesson') ||
    lower.includes('my schedule') ||
    lower.includes('upcoming') ||
    lower.includes('when is') ||
    lower.includes('calendar')
  ) {
    return { intent: 'list_events', entities: {}, confidence: 0.9 }
  }

  // Player search / match filling
  if (
    lower.includes('find player') ||
    lower.includes('find a player') ||
    lower.includes('need player') ||
    lower.includes('doubles') && (lower.includes('find') || lower.includes('need')) ||
    lower.includes('mixed doubles') ||
    lower.includes('hitting partner') ||
    lower.match(/utr\s*\d/)
  ) {
    const utrMatch = lower.match(/utr\s*(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/)
    const singleUtr = lower.match(/utr\s*(\d+(\.\d+)?)/)
    let utrMin, utrMax
    
    if (utrMatch) {
      utrMin = parseFloat(utrMatch[1])
      utrMax = parseFloat(utrMatch[3])
    } else if (singleUtr) {
      const val = parseFloat(singleUtr[1])
      utrMin = val - 0.5
      utrMax = val + 0.5
    }

    let gender: string | undefined
    if (lower.includes("mens") || lower.includes("men's")) gender = 'M'
    if (lower.includes("womens") || lower.includes("women's")) gender = 'F'

    let discipline: string | undefined
    if (lower.includes('mixed doubles')) discipline = 'mixed_doubles'
    else if (lower.includes('mens doubles') || lower.includes("men's doubles")) discipline = 'mens_doubles'
    else if (lower.includes('womens doubles') || lower.includes("women's doubles")) discipline = 'womens_doubles'
    else if (lower.includes('doubles')) discipline = 'open_doubles'
    else if (lower.includes('singles')) discipline = 'open_singles'

    return {
      intent: 'search_players',
      entities: { utr_min: utrMin, utr_max: utrMax, gender, discipline },
      confidence: 0.85
    }
  }

  // Payments
  if (
    lower.includes('owe') ||
    lower.includes('payment') ||
    lower.includes('how much') ||
    lower.includes('revenue') ||
    lower.includes('charge')
  ) {
    // Check if it's a create payment intent
    if (lower.includes('charge') || lower.includes('create payment')) {
      const amountMatch = lower.match(/\$(\d+)/)
      return {
        intent: 'create_payment_draft',
        entities: { amount: amountMatch ? parseInt(amountMatch[1]) * 100 : undefined },
        confidence: 0.7
      }
    }
    return { intent: 'list_payments', entities: {}, confidence: 0.8 }
  }

  // Create match
  if (
    lower.includes('book') ||
    lower.includes('create') && (lower.includes('match') || lower.includes('game') || lower.includes('clinic'))
  ) {
    return { intent: 'create_match_draft', entities: {}, confidence: 0.75 }
  }

  return { intent: 'general_chat', entities: {}, confidence: 0.5 }
}

export function generateMockResponse(intent: ParsedIntent, toolResults?: any): { response: string; requiresConfirmation?: boolean; pendingAction?: any } {
  switch(intent.intent) {
    case 'list_events':
      if (toolResults?.events?.length) {
        const events = toolResults.events.slice(0,3)
        const list = events.map((e: any) => `${new Date(e.start_at).toLocaleDateString()} ${e.title}`).join(', ')
        return { response: `Found ${toolResults.events.length} upcoming: ${list}. Want details on any?` }
      }
      return { response: "You have 2 upcoming: Thu 3pm Private with Coach Alex at Fremont HS and Sat 9am Group Clinic (UTR 4-5). Need to reschedule anything?" }
    
    case 'search_players':
      const utrInfo = intent.entities.utr_min ? ` at UTR ${intent.entities.utr_min}-${intent.entities.utr_max}` : ''
      return { 
        response: `Found 3 players${utrInfo} near you: Sarah 4.8F (0.3mi, Good Match), Leo 4.5M (1.2mi, Good Match), Emma 4.2F (0.8mi, Stretch). Want me to create a custom match and invite them?`,
        requiresConfirmation: false
      }
    
    case 'list_payments':
      if (toolResults?.payments) {
        const total = toolResults.payments.reduce((sum: number, p: any) => sum + p.amount_cents, 0)
        return { response: `You have ${toolResults.payments.length} payments totaling $${(total/100).toFixed(0)}. ${toolResults.payments.filter((p:any)=>p.status==='requires_capture').length} pending auto-capture.` }
      }
      return { response: "You owe $140 this week: $80 Private lesson Mon (auto-pays tonight 8pm) + $60 Group Clinic Thu. 1 payment pending capture. View receipt?" }
    
    case 'create_match_draft':
      const disc = intent.entities.discipline || 'mixed_doubles'
      return {
        response: `I can create a ${disc.replace('_',' ')} match. Here's draft: Thu 7pm at Fremont Tennis Center, UTR 4-5, Free. Need 3 more players. Invite suggested players?`,
        requiresConfirmation: true,
        pendingAction: {
          tool: 'create_custom_match',
          params: { discipline: disc, start_at: new Date(Date.now() + 24*3600*1000).toISOString(), location_name: 'Fremont Tennis Center', price_cents: 0 },
          summary: `Create ${disc} - Thu 7pm at Fremont Tennis Center, Free, needs 3 players, UTR 4-5`
        }
      }
    
    case 'create_payment_draft':
      return {
        response: `Create ad-hoc charge $${intent.entities.amount ? intent.entities.amount/100 : '40'} for stringing? Confirm?`,
        requiresConfirmation: true,
        pendingAction: {
          tool: 'create_payment',
          params: { amount_cents: intent.entities.amount || 4000, description: 'Racquet stringing' },
          summary: `Charge $${(intent.entities.amount||4000)/100} for Racquet stringing`
        }
      }
    
    default:
      return { 
        response: "Vamos! I'm your court captain. I can find players, check your schedule, handle payments, and create matches. Try: 'Find me a mixed doubles game Thu 7pm UTR 4-5' or 'When is my next lesson?' or 'Who owes me?'" 
      }
  }
}
