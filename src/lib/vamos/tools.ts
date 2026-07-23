export interface VamosTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required: string[]
  }
}

export const VAMOS_TOOLS: VamosTool[] = [
  {
    name: 'search_players',
    description: 'Find players by UTR range, gender, location, discipline. Use when user wants to find hitting partners or fill a doubles match.',
    parameters: {
      type: 'object',
      properties: {
        utr_min: { type: 'number', description: 'Minimum UTR 1-16.5' },
        utr_max: { type: 'number', description: 'Maximum UTR 1-16.5' },
        gender: { type: 'string', description: 'M, F, or any', enum: ['M', 'F', 'any'] },
        discipline: { type: 'string', description: 'mens_singles, womens_singles, mens_doubles, womens_doubles, mixed_doubles, open_singles, open_doubles, open' },
        location_radius_miles: { type: 'number', description: 'Radius in miles' },
      },
      required: []
    }
  },
  {
    name: 'list_events',
    description: 'List upcoming events for current user or coach. Use for schedule queries.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'ISO date from' },
        date_to: { type: 'string', description: 'ISO date to' },
        type: { type: 'string', description: 'Event type filter' },
        discipline: { type: 'string', description: 'Discipline filter' },
        is_paid: { type: 'boolean', description: 'Filter paid events' }
      },
      required: []
    }
  },
  {
    name: 'get_event_details',
    description: 'Get full details of a specific event',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event ID' }
      },
      required: ['event_id']
    }
  },
  {
    name: 'create_custom_match',
    description: 'Create a new custom match. Requires confirmation. Validates gender enforcement.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Match title' },
        discipline: { type: 'string', description: 'Discipline - must obey gender rules', enum: ['mens_singles','womens_singles','mens_doubles','womens_doubles','mixed_doubles','open_singles','open_doubles','open'] },
        format: { type: 'string', description: 'best_of_3_10pt_tb, pro_set_8_game, fast4, timed_90' },
        scoring_system: { type: 'string', description: 'ad or no_ad', enum: ['ad','no_ad'] },
        start_at: { type: 'string', description: 'ISO datetime' },
        location_name: { type: 'string', description: 'Court location name' },
        location_address: { type: 'string', description: 'Address' },
        price_cents: { type: 'number', description: 'Price in cents, 0 for free' },
        level_min_utr: { type: 'number', description: 'Min UTR' },
        level_max_utr: { type: 'number', description: 'Max UTR' },
      },
      required: ['discipline', 'start_at', 'location_name']
    }
  },
  {
    name: 'invite_to_match',
    description: 'Invite players to a custom match',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event/match ID' },
        player_ids: { type: 'string', description: 'Comma-separated player IDs' }
      },
      required: ['event_id', 'player_ids']
    }
  },
  {
    name: 'list_payments',
    description: 'List payments owed or earned. Use when asked about money, owes, revenue.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status: pending, requires_capture, captured, failed' }
      },
      required: []
    }
  },
  {
    name: 'create_payment',
    description: 'Create ad-hoc charge for student. Requires confirmation. Use for stringing, late fees, etc.',
    parameters: {
      type: 'object',
      properties: {
        student_id: { type: 'string', description: 'Student user ID' },
        amount_cents: { type: 'number', description: 'Amount in cents' },
        description: { type: 'string', description: 'Reason for charge' },
        type: { type: 'string', description: 'adhoc, late_fee, no_show', enum: ['adhoc','late_fee','no_show'] }
      },
      required: ['student_id', 'amount_cents', 'description']
    }
  },
  {
    name: 'send_notification',
    description: 'Send notification or broadcast to students',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        body: { type: 'string', description: 'Body' },
        broadcast_to_all: { type: 'boolean', description: 'If true, broadcast to all linked students' }
      },
      required: ['title', 'body']
    }
  }
]
