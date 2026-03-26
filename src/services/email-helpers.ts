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
import { registerEmailListeners as baseRegister, emailService } from '~/services/email.service'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

/** Build login URL that redirects to business dashboard after sign-in. */
export function getDashboardLoginUrl(): string {
  const base = FRONTEND_URL.replace(/\/$/, '')
  return `${base}/login?redirect=${encodeURIComponent('/dashboard')}`
}

const NO_REPLY_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noresponder@notificaciones.kellu.co'
const KELLU_FROM_NAME = process.env.RESEND_KELLU_FROM_NAME ?? 'Kellu'
const KELLU_REPLY_TO = process.env.RESEND_KELLU_REPLY_TO ?? 'equipo@kellu.co'

/** From header for Kellu → Client (system emails). */
const KELLU_TO_CLIENT_FROM = `${KELLU_FROM_NAME} <${NO_REPLY_EMAIL}>`

/** Build From header for Client → Their Customers. Uses verified sender; Reply-To is company email. */
export function clientToCustomerFrom(companyName: string): string {
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

export interface SendSettingsUpdatedEmailParams {
  to: string
  ownerName: string
  businessName: string
  appName?: string
}

/**
 * Send settings updated notification (Kellu → Client).
 * From: Kellu <noresponder@...>, Reply-To: equipo@kellu.co
 */
export function sendSettingsUpdatedEmail(params: SendSettingsUpdatedEmailParams): void {
  const { to, ownerName, businessName, appName } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'settings-updated' as EmailTemplate,
    payload: { ownerName, businessName, appName },
    from: KELLU_TO_CLIENT_FROM,
    replyTo: KELLU_REPLY_TO,
  })
}

export interface SendWorkOrderCreatedEmailParams {
  to: string
  clientName: string
  businessName: string
  companyReplyTo: string
  workOrderNumber: string
  title: string
  address: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  lineItemsSummary: string
  total?: string
  subject?: string
  /** Company logo URL (Company Settings). Shown in email header. */
  companyLogoUrl?: string | null
}

/**
 * Send work order created email to customer (Client → Their Customers).
 * From: {businessName} <noresponder@...>, Reply-To: companyReplyTo.
 * Used when a work order is created.
 */
export function sendWorkOrderCreatedEmail(params: SendWorkOrderCreatedEmailParams): void {
  const {
    to,
    clientName,
    businessName,
    companyReplyTo,
    workOrderNumber,
    title,
    address,
    date,
    timeRange,
    assignedTeamMemberName,
    lineItemsSummary,
    total,
    subject,
    companyLogoUrl,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'work-order-created' as EmailTemplate,
    payload: {
      clientName,
      businessName,
      workOrderNumber,
      title,
      address,
      date,
      timeRange,
      assignedTeamMemberName,
      lineItemsSummary,
      total,
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
  })
}

export interface SendTaskCreatedEmailParams {
  to: string
  clientName: string
  businessName: string
  companyReplyTo: string
  title: string
  address: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  instructions?: string
  subject?: string
  /** Company logo URL (Company Settings). Shown in email header. */
  companyLogoUrl?: string | null
}

/**
 * Send task created email to client (Client → Their Customers).
 * From: {businessName} <noresponder@...>, Reply-To: companyReplyTo.
 * Used when a task is created and the task has an associated client with email.
 */
export function sendTaskCreatedEmail(params: SendTaskCreatedEmailParams): void {
  const {
    to,
    clientName,
    businessName,
    companyReplyTo,
    title,
    address,
    date,
    timeRange,
    assignedTeamMemberName,
    instructions,
    subject,
    companyLogoUrl,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'task-created' as EmailTemplate,
    payload: {
      clientName,
      businessName,
      title,
      address,
      date,
      timeRange,
      assignedTeamMemberName,
      instructions: instructions ?? '',
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
  })
}

/**
 * Send team member invitation with login credentials, dashboard link, role and permissions (Kellu → Team member).
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
  /** Role permissions for display in email (e.g. [{ resource: 'workorders', action: 'read' }]). */
  permissions?: Array<{ resource: string; action: string }>
}

export async function sendTeamMemberInvitationEmail(
  params: SendTeamMemberInvitationParams
): Promise<void> {
  const { to, memberName, businessName, roleName, email, password, description, permissions } =
    params
  const loginUrl = getDashboardLoginUrl()

  const subject = (emailSubjects as Record<string, string>)['add-team-member']
  const html = await renderEmailTemplate('add-team-member' as never, {
    memberName,
    businessName,
    roleName,
    email,
    password,
    loginUrl,
    description: description ?? undefined,
    permissions: permissions ?? [],
  })

  await emailService.send({
    to,
    subject,
    html,
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
  /** Company logo URL (Company Settings). Shown in email header. */
  companyLogoUrl?: string | null
}

/**
 * Send email to client's customer when business creates/updates profile (Client → Their Customers).
 * From: {businessName} <noresponder@...>, Reply-To: companyReplyTo.
 */
export function sendClientProfileUpdateEmail(params: SendClientProfileUpdateParams): void {
  const { to, clientName, businessName, companyReplyTo, isUpdate, companyLogoUrl } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'client-profile-update' as EmailTemplate,
    payload: {
      clientName,
      businessName,
      isUpdate,
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
  })
}

export interface SendBookingConfirmationParams {
  to: string
  clientName: string
  serviceTitle: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  businessName: string
  companyReplyTo: string
  /** Override default subject (e.g. "Booking Confirmation - Plumbing Repair - Jan 15, 2024") */
  subject?: string
  /** Company logo URL (Company Settings). Shown in email header. */
  companyLogoUrl?: string | null
}

/**
 * Send booking confirmation email to customer (Client → Their Customers).
 * From: {businessName} <noresponder@...>, Reply-To: companyReplyTo.
 * Used when business owner confirms a booking from the work order screen.
 */
export function sendBookingConfirmationEmail(params: SendBookingConfirmationParams): void {
  const {
    to,
    clientName,
    serviceTitle,
    date,
    timeRange,
    assignedTeamMemberName,
    businessName,
    companyReplyTo,
    subject,
    companyLogoUrl,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'booking-confirmation' as EmailTemplate,
    payload: {
      clientName,
      serviceTitle,
      date,
      timeRange,
      assignedTeamMemberName,
      businessName,
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
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
      subjectOverride?: string
    }) => {
      try {
        const html = await renderEmailTemplate(data.template, data.payload)
        const subject = data.subjectOverride ?? emailSubjects[data.template]
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
