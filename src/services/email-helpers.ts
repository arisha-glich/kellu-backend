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

/** Build login URL that redirects to admin dashboard after sign-in. */
export function getAdminDashboardLoginUrl(): string {
  const base = FRONTEND_URL.replace(/\/$/, '')
  const adminPath = process.env.ADMIN_DASHBOARD_PATH ?? '/admin'
  return `${base}/login?redirect=${encodeURIComponent(adminPath)}`
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
  /** Shown in the details box when set (trimmed non-empty). */
  instructions?: string | null
  /** Formatted tax amount, e.g. "$12.34". */
  tax?: string | null
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
    instructions,
    tax,
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
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
      ...(tax != null && tax !== '' ? { tax } : {}),
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
  })
}

export interface SendWorkOrderAssignedToTeamMemberEmailParams {
  to: string
  assigneeName: string
  businessName: string
  companyReplyTo: string
  workOrderNumber: string
  title: string
  clientName: string
  clientPhone?: string | null
  address: string
  date: string
  timeRange: string
  lineItemsSummary?: string
  instructions?: string | null
  total?: string
  companyLogoUrl?: string | null
  subject?: string
}

/**
 * Notify assigned team member about a new work order (Client → Their team, same From/Reply-To as customer-facing).
 */
export function sendWorkOrderAssignedToTeamMemberEmail(
  params: SendWorkOrderAssignedToTeamMemberEmailParams
): void {
  const {
    to,
    assigneeName,
    businessName,
    companyReplyTo,
    workOrderNumber,
    title,
    clientName,
    clientPhone,
    address,
    date,
    timeRange,
    lineItemsSummary,
    instructions,
    total,
    companyLogoUrl,
    subject,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'work-order-assigned-team' as EmailTemplate,
    payload: {
      assigneeName,
      businessName,
      workOrderNumber,
      title,
      clientName,
      ...(clientPhone?.trim() ? { clientPhone: clientPhone.trim() } : {}),
      address,
      date,
      timeRange,
      lineItemsSummary: lineItemsSummary ?? '',
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
      ...(total != null && total !== '' ? { total } : {}),
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
  })
}

export interface SendInvoiceCreatedClientEmailParams {
  to: string
  clientName: string
  businessName: string
  companyReplyTo: string
  invoiceNumber: string
  title: string
  address: string
  createdDate: string
  assignedTeamMemberName: string
  lineItemsSummary: string
  subtotal?: string
  tax?: string
  total?: string
  balance?: string
  workOrderSummary?: string | null
  companyLogoUrl?: string | null
  subject?: string
}

export function sendInvoiceCreatedClientEmail(params: SendInvoiceCreatedClientEmailParams): void {
  const {
    to,
    clientName,
    businessName,
    companyReplyTo,
    invoiceNumber,
    title,
    address,
    createdDate,
    assignedTeamMemberName,
    lineItemsSummary,
    subtotal,
    tax,
    total,
    balance,
    workOrderSummary,
    companyLogoUrl,
    subject,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'invoice-created-client' as EmailTemplate,
    payload: {
      clientName,
      businessName,
      invoiceNumber,
      title,
      address,
      createdDate,
      assignedTeamMemberName,
      lineItemsSummary: lineItemsSummary ?? '',
      ...(subtotal != null && subtotal !== '' ? { subtotal } : {}),
      ...(tax != null && tax !== '' ? { tax } : {}),
      ...(total != null && total !== '' ? { total } : {}),
      ...(balance != null && balance !== '' ? { balance } : {}),
      ...(workOrderSummary?.trim() ? { workOrderSummary: workOrderSummary.trim() } : {}),
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
  })
}

export interface SendInvoiceAssignedToTeamMemberEmailParams {
  to: string
  assigneeName: string
  businessName: string
  companyReplyTo: string
  invoiceNumber: string
  title: string
  clientName: string
  clientPhone?: string | null
  address: string
  createdDate: string
  lineItemsSummary: string
  subtotal?: string
  tax?: string
  total?: string
  balance?: string
  workOrderSummary?: string | null
  observations?: string | null
  companyLogoUrl?: string | null
  subject?: string
}

export function sendInvoiceAssignedToTeamMemberEmail(
  params: SendInvoiceAssignedToTeamMemberEmailParams
): void {
  const {
    to,
    assigneeName,
    businessName,
    companyReplyTo,
    invoiceNumber,
    title,
    clientName,
    clientPhone,
    address,
    createdDate,
    lineItemsSummary,
    subtotal,
    tax,
    total,
    balance,
    workOrderSummary,
    observations,
    companyLogoUrl,
    subject,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'invoice-assigned-team' as EmailTemplate,
    payload: {
      assigneeName,
      businessName,
      invoiceNumber,
      title,
      clientName,
      ...(clientPhone?.trim() ? { clientPhone: clientPhone.trim() } : {}),
      address,
      createdDate,
      lineItemsSummary: lineItemsSummary ?? '',
      ...(subtotal != null && subtotal !== '' ? { subtotal } : {}),
      ...(tax != null && tax !== '' ? { tax } : {}),
      ...(total != null && total !== '' ? { total } : {}),
      ...(balance != null && balance !== '' ? { balance } : {}),
      ...(workOrderSummary?.trim() ? { workOrderSummary: workOrderSummary.trim() } : {}),
      ...(observations?.trim() ? { observations: observations.trim() } : {}),
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
  })
}

export interface SendWorkOrderRescheduledEmailParams {
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
  subject?: string
  companyLogoUrl?: string | null
  instructions?: string | null
}

/**
 * Notify customer that a work order's schedule was updated (Client → Their Customers).
 */
export function sendWorkOrderRescheduledEmail(params: SendWorkOrderRescheduledEmailParams): void {
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
    subject,
    companyLogoUrl,
    instructions,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'work-order-rescheduled' as EmailTemplate,
    payload: {
      clientName,
      businessName,
      workOrderNumber,
      title,
      address,
      date,
      timeRange,
      assignedTeamMemberName,
      logoUrl: companyLogoUrl ?? undefined,
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
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

export interface SendTaskAssignedToTeamMemberEmailParams {
  to: string
  assigneeName: string
  businessName: string
  companyReplyTo: string
  title: string
  clientName: string
  clientPhone?: string | null
  address: string
  date: string
  timeRange: string
  instructions?: string | null
  companyLogoUrl?: string | null
  subject?: string
}

/** Notify assigned team member about a new task (same From/Reply-To as customer-facing). */
export function sendTaskAssignedToTeamMemberEmail(
  params: SendTaskAssignedToTeamMemberEmailParams
): void {
  const {
    to,
    assigneeName,
    businessName,
    companyReplyTo,
    title,
    clientName,
    clientPhone,
    address,
    date,
    timeRange,
    instructions,
    companyLogoUrl,
    subject,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'task-assigned-team' as EmailTemplate,
    payload: {
      assigneeName,
      businessName,
      title,
      clientName,
      ...(clientPhone?.trim() ? { clientPhone: clientPhone.trim() } : {}),
      address,
      date,
      timeRange,
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
      logoUrl: companyLogoUrl ?? undefined,
    },
    from: clientToCustomerFrom(businessName),
    replyTo: companyReplyTo,
    subjectOverride: subject,
  })
}

export interface SendTaskRescheduledEmailParams {
  to: string
  clientName: string
  businessName: string
  companyReplyTo: string
  title: string
  address: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  subject?: string
  companyLogoUrl?: string | null
  instructions?: string | null
}

/**
 * Notify customer that a task's schedule was updated (Client → Their Customers).
 */
export function sendTaskRescheduledEmail(params: SendTaskRescheduledEmailParams): void {
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
    subject,
    companyLogoUrl,
    instructions,
  } = params
  appEventEmitter.emit('mail:send-template', {
    to,
    template: 'task-rescheduled' as EmailTemplate,
    payload: {
      clientName,
      businessName,
      title,
      address,
      date,
      timeRange,
      assignedTeamMemberName,
      logoUrl: companyLogoUrl ?? undefined,
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
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
  /** Which portal this member should use after login. */
  portalType?: 'business' | 'admin'
}

export async function sendTeamMemberInvitationEmail(
  params: SendTeamMemberInvitationParams
): Promise<void> {
  const { to, memberName, businessName, roleName, email, password, description, permissions } =
    params
  const portalType = params.portalType ?? 'business'
  const loginUrl = portalType === 'admin' ? getAdminDashboardLoginUrl() : getDashboardLoginUrl()
  const portalLabel = portalType === 'admin' ? 'admin dashboard' : 'business dashboard'

  const subject = (emailSubjects as Record<string, string>)['add-team-member']
  const html = await renderEmailTemplate('add-team-member' as never, {
    memberName,
    businessName,
    roleName,
    email,
    password,
    loginUrl,
    portalLabel,
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

export interface SendCustomerReminderEmailParams {
  to: string
  clientName: string
  businessName: string
  companyReplyTo: string
  workOrderTitle: string
  reminderDateTime: Date
  note?: string | null
}

/**
 * Send customer reminder email (Client → Their Customers).
 * From: {businessName} <noresponder@...>, Reply-To: companyReplyTo.
 */
export function sendCustomerReminderEmail(params: SendCustomerReminderEmailParams): void {
  const { to, clientName, businessName, companyReplyTo, workOrderTitle, reminderDateTime, note } =
    params
  const dateText = reminderDateTime.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeText = reminderDateTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const safeNote = (note ?? '').trim()
  const noteHtml = safeNote.length > 0 ? `<p><strong>Note:</strong> ${safeNote}</p>` : ''

  appEventEmitter.emitSendMail({
    to,
    subject: `Reminder: ${workOrderTitle} on ${dateText} ${timeText}`,
    html: `
      <p>Hi ${clientName},</p>
      <p>This is a reminder for your upcoming service: <strong>${workOrderTitle}</strong>.</p>
      <p><strong>When:</strong> ${dateText} at ${timeText}</p>
      ${noteHtml}
      <p>If you need to reschedule, please reply to this email.</p>
      <p>Thanks,<br/>${businessName}</p>
    `,
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
