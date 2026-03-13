/**
 * Kellu email helpers – two communication structures:
 *
 * 1. Kellu → Client: system emails (welcome, billing, product updates).
 *    From: Kellu <noresponder@notificaciones.kellu.co>, Reply-To: equipo@kellu.co
 *
 * 2. Client → Their Customers: emails sent by our clients to their customers
 *    (service confirmation, reminders, profile updates).
 *    From: {Company Name} <noresponder@notificaciones.kellu.co>, Reply-To: client's company email
 */

import type { EmailTemplate } from '~/lib/email-render'
import { emailSubjects, renderEmailTemplate } from '~/lib/email-render'
import { appEventEmitter } from '~/lib/event-emitter'
import { registerEmailListeners as baseRegister } from '~/services/email.service'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3001'

const NO_REPLY_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noresponder@notificaciones.kellu.co'
const KELLU_FROM_NAME = process.env.RESEND_KELLU_FROM_NAME ?? 'Kellu'
const KELLU_REPLY_TO = process.env.RESEND_KELLU_REPLY_TO ?? 'equipo@kellu.co'

/** From header for Kellu → Client (system emails). */
const KELLU_TO_CLIENT_FROM = `${KELLU_FROM_NAME} <${NO_REPLY_EMAIL}>`

/** Build From header for Client → Their Customers (company name as sender). */
function clientToCustomerFrom(companyName: string): string {
  const name = (companyName || 'Kellu').trim()
  return `${name} <${NO_REPLY_EMAIL}>`
}

export interface SendBusinessInvitationParams {
  to: string
  businessName: string
  ownerName: string
  email: string
  tempPassword: string
}

/**
 * Send business invitation email with login credentials (Kellu → Client).
 * From: Kellu <noresponder@...>, Reply-To: equipo@kellu.co
 */
export async function sendBusinessInvitationEmail(
  params: SendBusinessInvitationParams
): Promise<void> {
  const { to, businessName, ownerName, email, tempPassword } = params
  const loginUrl = `${FRONTEND_URL}/login`

  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'add-business' as EmailTemplate,
    payload: {
      businessOwnerName: ownerName,
      businessName,
      email,
      password: tempPassword,
      loginUrl,
    },
    from: KELLU_TO_CLIENT_FROM,
    replyTo: KELLU_REPLY_TO,
  })
}

/**
 * Send team member invitation with login credentials and optional description (Kellu → Team member).
 */
export interface SendTeamMemberInvitationParams {
  to: string
  memberName: string
  businessName: string
  roleName: string
  email: string
  password: string
  /** Optional text describing the member's role or what they can do (included in email body). */
  description?: string
}

export async function sendTeamMemberInvitationEmail(
  params: SendTeamMemberInvitationParams
): Promise<void> {
  const { to, memberName, businessName, roleName, email, password, description } = params
  const loginUrl = `${FRONTEND_URL}/login`

  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'add-team-member' as EmailTemplate,
    payload: {
      memberName,
      businessName,
      roleName,
      email,
      password,
      loginUrl,
      description: description ?? undefined,
    },
    from: KELLU_TO_CLIENT_FROM,
    replyTo: KELLU_REPLY_TO,
  })
}

export interface SendClientProfileUpdateParams {
  to: string
  clientName: string
  businessName: string
  /** Company email for Reply-To (Client → Their Customers). */
  companyReplyTo: string
  isUpdate: boolean
}

/**
 * Send email to client's customer when business creates/updates profile (Client → Their Customers).
 * From: {businessName} <noresponder@...>, Reply-To: companyReplyTo.
 */
export function sendClientProfileUpdateEmail(params: SendClientProfileUpdateParams): void {
  const { to, clientName, businessName, companyReplyTo, isUpdate } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'client-profile-update' as EmailTemplate,
    payload: { clientName, businessName, isUpdate },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
  })
}

/**
 * Register email listeners: base (mail:send) + template rendering (mail:send-template).
 */
export function registerEmailListeners(): void {
  baseRegister()

  appEventEmitter.on(
    'mail:send-template',
    async (data: {
      to: string | string[]
      template: EmailTemplate
      payload: Record<string, unknown>
      from?: string
      replyTo?: string | string[]
    }) => {
      try {
        const html = await renderEmailTemplate(data.template, data.payload)
        const subject = emailSubjects[data.template]
        appEventEmitter.emitSendMail({
          to: data.to,
          subject,
          html,
          from: data.from,
          replyTo: data.replyTo,
        })
      } catch (error) {
        console.error('❌ [EMAIL] Failed to render/send template:', error)
      }
    }
  )
}
