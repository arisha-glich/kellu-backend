import type { ClientStatus, LeadSource, Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import { sendClientProfileUpdateEmail } from '~/services/email-helpers'

export class ClientNotFoundError extends Error {
  constructor() {
    super('CLIENT_NOT_FOUND')
  }
}

export class EmailAlreadyUsedError extends Error {
  constructor() {
    super('EMAIL_ALREADY_USED')
  }
}

export class ClientEmailRequiredError extends Error {
  constructor() {
    super('CLIENT_EMAIL_REQUIRED')
  }
}
export class ClientReminderNotFoundError extends Error {
  constructor() {
    super('CLIENT_REMINDER_NOT_FOUND')
  }
}

export interface CreateClientInput {
  name: string
  phone: string
  email?: string | null
  documentNumber?: string | null
  leadSource?: LeadSource
  notes?: string | null
}

export interface UpdateClientInput {
  name?: string
  phone?: string
  email?: string | null
  documentNumber?: string | null
  leadSource?: LeadSource
  notes?: string | null
  status?: ClientStatus
}

export interface ClientListFilters {
  search?: string
  status?: ClientStatus
  sortBy?: 'name' | 'lastActivityAt' | 'createdAt'
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface ClientListItem {
  id: string
  businessId: string
  name: string
  status: string
  lastActivity: string | null
}

export interface ClientStatistics {
  newClientsLast30Days: number
  totalNewClientsYTD: number
}

export type ClientMessageStatus = 'SEND_OFFER' | 'MAINTENANCE_FOLLOW_UP'

export interface ClientMessageTemplateResult {
  status: ClientMessageStatus
  to: string | null
  subjectTemplate: string
  messageTemplate: string
  subjectPreview: string
  messagePreview: string
}

interface ClientMessageTemplateVariables {
  clientName: string
  companyName: string
  defaultEmail: string
  currentDate: string
}

export interface ClientDetail {
  id: string
  businessId: string
  name: string
  phone: string
  email: string | null
  address: string | null
  documentNumber: string | null
  leadSource: string
  notes: string | null
  status: string
  lastActivityAt: Date | null
  lastActivity: string | null
  createdAt: Date
  updatedAt: Date
}

function formatLastActivity(d: Date | null): string | null {
  if (!d) {
    return null
  }
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) {
    return 'Just now'
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)} minutes ago`
  }
  if (sec < 86400) {
    return `${Math.floor(sec / 3600)} hours ago`
  }
  if (sec < 604800) {
    return `${Math.floor(sec / 86400)} days ago`
  }
  if (sec < 2592000) {
    return `${Math.floor(sec / 86400)} days ago`
  }
  if (sec < 31536000) {
    return `${Math.floor(sec / 2592000)} months ago`
  }
  return `${Math.floor(sec / 31536000)} years ago`
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }
}

export async function createClient(businessId: string, data: CreateClientInput) {
  await ensureBusinessExists(businessId)

  if (data.email) {
    const existing = await prisma.client.findFirst({
      where: {
        businessId,
        email: { equals: data.email, mode: 'insensitive' },
      },
    })
    if (existing) {
      throw new EmailAlreadyUsedError()
    }
  }

  const client = await prisma.client.create({
    data: {
      businessId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      documentNumber: data.documentNumber ?? null,
      leadSource: data.leadSource ?? 'Website',
      notes: data.notes ?? null,
      lastActivityAt: new Date(),
    },
  })

  if (client.email) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, email: true, logoUrl: true },
    })
    if (business?.email) {
      sendClientProfileUpdateEmail({
        to: client.email,
        clientName: client.name,
        businessName: business.name,
        companyReplyTo: business.email,
        companyLogoUrl: business.logoUrl ?? undefined,
        isUpdate: false,
      })
    }
  }

  return mapToClientDetail(client)
}

export async function getClients(businessId: string, filters: ClientListFilters = {}) {
  await ensureBusinessExists(businessId)

  const { search, status, sortBy = 'createdAt', order = 'desc', page = 1, limit = 10 } = filters

  const skip = (page - 1) * limit

  const searchWhere = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const statusWhere = status ? { status } : {}
  const where = { businessId, ...searchWhere, ...statusWhere }

  const orderByField =
    sortBy === 'lastActivityAt' ? 'lastActivityAt' : sortBy === 'name' ? 'name' : 'createdAt'
  const orderBy = { [orderByField]: order }

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.client.count({ where }),
  ])

  const data: ClientListItem[] = clients.map(c => ({
    id: c.id,
    businessId: c.businessId,
    name: c.name,
    status: c.status,
    lastActivity: formatLastActivity(c.lastActivityAt ?? c.updatedAt),
  }))

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function getClientStatistics(businessId: string): Promise<ClientStatistics> {
  await ensureBusinessExists(businessId)

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [newClientsLast30Days, totalNewClientsYTD] = await Promise.all([
    prisma.client.count({
      where: {
        businessId,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.client.count({
      where: {
        businessId,
        createdAt: { gte: startOfYear },
      },
    }),
  ])

  return {
    newClientsLast30Days,
    totalNewClientsYTD,
  }
}

function mapToClientDetail(client: {
  id: string
  businessId: string
  name: string
  phone: string
  email: string | null
  address: string | null
  documentNumber: string | null
  leadSource: string
  notes: string | null
  status: string
  lastActivityAt: Date | null
  createdAt: Date
  updatedAt: Date
}): ClientDetail {
  return {
    id: client.id,
    businessId: client.businessId,
    name: client.name,
    phone: client.phone,
    email: client.email,
    address: client.address,
    documentNumber: client.documentNumber,
    leadSource: client.leadSource,
    notes: client.notes,
    status: client.status,
    lastActivityAt: client.lastActivityAt,
    lastActivity: formatLastActivity(client.lastActivityAt ?? client.updatedAt),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }
}

export async function getClientById(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })

  if (!client) {
    throw new ClientNotFoundError()
  }
  return mapToClientDetail(client)
}

/** Get client by ID only (no business scope – use for GET /clients/:clientId) */
export async function getClientByClientId(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }
  return mapToClientDetail(client)
}

export async function updateClient(businessId: string, clientId: string, data: UpdateClientInput) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.phone != null && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.documentNumber !== undefined && { documentNumber: data.documentNumber }),
      ...(data.leadSource != null && { leadSource: data.leadSource }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status != null && { status: data.status }),
    },
  })

  if (client.email) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, email: true, logoUrl: true },
    })
    if (business?.email) {
      sendClientProfileUpdateEmail({
        to: client.email,
        clientName: client.name,
        businessName: business.name,
        companyReplyTo: business.email,
        companyLogoUrl: business.logoUrl ?? undefined,
        isUpdate: true,
      })
    }
  }

  return mapToClientDetail(client)
}

/** Update client by ID only (no business in path – use for PATCH /clients/:clientId) */
export async function updateClientByClientId(clientId: string, data: UpdateClientInput) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.phone != null && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.documentNumber !== undefined && { documentNumber: data.documentNumber }),
      ...(data.leadSource != null && { leadSource: data.leadSource }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status != null && { status: data.status }),
    },
  })

  if (client.email) {
    const business = await prisma.business.findUnique({
      where: { id: client.businessId },
      select: { name: true, email: true, logoUrl: true },
    })
    if (business?.email) {
      sendClientProfileUpdateEmail({
        to: client.email,
        clientName: client.name,
        businessName: business.name,
        companyReplyTo: business.email,
        companyLogoUrl: business.logoUrl ?? undefined,
        isUpdate: true,
      })
    }
  }

  return mapToClientDetail(client)
}

export async function deleteClient(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }

  await prisma.client.delete({
    where: { id: clientId },
  })
}

/** Delete client by ID only (no business in path – use for DELETE /clients/:clientId) */
export async function deleteClientByClientId(clientId: string) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!existing) {
    throw new ClientNotFoundError()
  }
  await prisma.client.delete({
    where: { id: clientId },
  })
}

export function getLeadSources(): { value: string; label: string }[] {
  return [
    { value: 'Website', label: 'Website' },
    { value: 'SocialMedia', label: 'Social Media' },
    { value: 'Referral', label: 'Referral' },
    { value: 'Other', label: 'Other' },
  ]
}

function formatCurrentDateForTemplate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildTemplateContent(status: ClientMessageStatus): {
  subjectTemplate: string
  messageTemplate: string
} {
  if (status === 'SEND_OFFER') {
    return {
      subjectTemplate: 'Special offer from {{COMPANY_NAME}} - {{CURRENT_DATE}}',
      messageTemplate: [
        'Hi {{CLIENT_NAME}},',
        '',
        'We have a special offer for you.',
        '',
        'Get in touch with us at {{DEFAULT_EMAIL}} to learn more.',
        '',
        'Sincerely,',
        '{{COMPANY_NAME}}',
      ].join('\n'),
    }
  }

  return {
    subjectTemplate: 'Maintenance follow-up from {{COMPANY_NAME}}',
    messageTemplate: [
      'Hi {{CLIENT_NAME}},',
      '',
      'This is a friendly reminder about your scheduled maintenance.',
      '',
      'If you have any questions, contact us at {{DEFAULT_EMAIL}}.',
      '',
      'Best regards,',
      '{{COMPANY_NAME}}',
    ].join('\n'),
  }
}

function applyClientTemplateVariables(input: string, data: ClientMessageTemplateVariables): string {
  return input
    .split('{{CLIENT_NAME}}')
    .join(data.clientName)
    .split('{{COMPANY_NAME}}')
    .join(data.companyName)
    .split('{{DEFAULT_EMAIL}}')
    .join(data.defaultEmail)
    .split('{{CURRENT_DATE}}')
    .join(data.currentDate)
}

function toHtmlFromPlainText(text: string): string {
  return text
    .split('\n')
    .map(line => (line.length > 0 ? `<p>${line}</p>` : '<br/>'))
    .join('')
}

function buildClientMessageTemplateResult(
  status: ClientMessageStatus,
  to: string | null,
  variables: ClientMessageTemplateVariables
): ClientMessageTemplateResult {
  const { subjectTemplate, messageTemplate } = buildTemplateContent(status)
  return {
    status,
    to,
    subjectTemplate,
    messageTemplate,
    subjectPreview: applyClientTemplateVariables(subjectTemplate, variables),
    messagePreview: applyClientTemplateVariables(messageTemplate, variables),
  }
}

export async function getLatestClientMessageTemplate(
  clientId: string,
  status: ClientMessageStatus
): Promise<ClientMessageTemplateResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      email: true,
      businessId: true,
      business: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const latestLog = await prisma.auditLog.findFirst({
    where: {
      businessId: client.businessId,
      entityType: 'CLIENT_MESSAGE',
      entityId: client.id,
      action: `CLIENT_MESSAGE_SENT_${status}`,
    },
    orderBy: { createdAt: 'desc' },
    select: { newValues: true },
  })

  const logRecord = latestLog?.newValues as {
    status?: ClientMessageStatus
    to?: string | null
    subjectTemplate?: string
    messageTemplate?: string
    subjectPreview?: string
    messagePreview?: string
  } | null

  if (
    logRecord?.status === status &&
    typeof logRecord.subjectTemplate === 'string' &&
    typeof logRecord.messageTemplate === 'string' &&
    typeof logRecord.subjectPreview === 'string' &&
    typeof logRecord.messagePreview === 'string'
  ) {
    return {
      status,
      to: logRecord.to ?? client.email,
      subjectTemplate: logRecord.subjectTemplate,
      messageTemplate: logRecord.messageTemplate,
      subjectPreview: logRecord.subjectPreview,
      messagePreview: logRecord.messagePreview,
    }
  }

  const variables = {
    clientName: client.name,
    companyName: client.business.name,
    defaultEmail: client.business.email,
    currentDate: formatCurrentDateForTemplate(new Date()),
  }
  return buildClientMessageTemplateResult(status, client.email, variables)
}

export async function getClientMessageTemplate(
  clientId: string,
  status: ClientMessageStatus,
  senderUserId?: string
): Promise<ClientMessageTemplateResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      email: true,
      businessId: true,
      business: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })

  if (!client) {
    throw new ClientNotFoundError()
  }
  if (!client.email) {
    throw new ClientEmailRequiredError()
  }

  const variables = {
    clientName: client.name,
    companyName: client.business.name,
    defaultEmail: client.business.email,
    currentDate: formatCurrentDateForTemplate(new Date()),
  }
  const messageData = buildClientMessageTemplateResult(status, client.email, variables)

  await emailService.send({
    to: client.email,
    subject: messageData.subjectPreview,
    html: toHtmlFromPlainText(messageData.messagePreview),
    from: `${client.business.name} <${process.env.RESEND_FROM_EMAIL ?? 'noresponder@notificaciones.kellu.co'}>`,
    replyTo: client.business.email,
  })

  await prisma.auditLog.create({
    data: {
      action: `CLIENT_MESSAGE_SENT_${status}`,
      entityType: 'CLIENT_MESSAGE',
      entityId: client.id,
      businessId: client.businessId,
      userId: senderUserId,
      newValues: messageData as unknown as Prisma.InputJsonValue,
    },
  })

  return messageData
}

export async function listClientCustomerReminders(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)
  const clientRecord = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, reminderDate: true, reminderNote: true },
  })
  if (!clientRecord) {
    throw new ClientNotFoundError()
  }

  const reminderLogs = await prisma.reminderLog.findMany({
    where: { businessId, clientId: clientRecord.id, reminderType: 'CLIENT_FOLLOW_UP' },
    orderBy: { sentAt: 'desc' },
  })

  return {
    upcomingReminder:
      clientRecord.reminderDate != null
        ? {
            dateTime: clientRecord.reminderDate,
            note: clientRecord.reminderNote ?? null,
          }
        : null,
    reminders: reminderLogs.map(item => ({
      id: item.id,
      dateTime: item.sentAt,
      note: item.note ?? null,
      createdAt: item.createdAt,
    })),
  }
}

export async function createClientCustomerReminder(
  businessId: string,
  clientId: string,
  data: { dateTime: Date; note?: string | null }
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, name: true, email: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.client.update({
      where: { id: client.id },
      data: {
        reminderDate: data.dateTime,
        reminderNote: data.note ?? null,
        status: 'FOLLOW_UP',
      },
    })

    await tx.reminderLog.create({
      data: {
        reminderType: 'CLIENT_FOLLOW_UP',
        sentAt: data.dateTime,
        note: data.note ?? null,
        channel: 'EMAIL',
        entityType: 'CLIENT',
        entityId: clientId,
        clientId: client.id,
        businessId,
      },
    })
  })

  return listClientCustomerReminders(businessId, clientId)
}

export async function getClientCustomerReminderById(
  businessId: string,
  clientId: string,
  reminderId: string
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const reminder = await prisma.reminderLog.findFirst({
    where: { id: reminderId, businessId, clientId: client.id, reminderType: 'CLIENT_FOLLOW_UP' },
  })
  if (!reminder) {
    throw new ClientReminderNotFoundError()
  }

  return {
    id: reminder.id,
    dateTime: reminder.sentAt,
    note: reminder.note ?? null,
    createdAt: reminder.createdAt,
  }
}

export async function updateClientCustomerReminderById(
  businessId: string,
  clientId: string,
  reminderId: string,
  data: { dateTime?: Date; note?: string | null }
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, reminderDate: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const existing = await prisma.reminderLog.findFirst({
    where: { id: reminderId, businessId, clientId: client.id, reminderType: 'CLIENT_FOLLOW_UP' },
  })
  if (!existing) {
    throw new ClientReminderNotFoundError()
  }

  const nextDateTime = data.dateTime ?? existing.sentAt
  await prisma.$transaction(async tx => {
    await tx.reminderLog.update({
      where: { id: existing.id },
      data: {
        sentAt: nextDateTime,
        ...(data.note !== undefined && { note: data.note ?? null }),
      },
    })

    if (client.reminderDate != null && client.reminderDate.getTime() === existing.sentAt.getTime()) {
      await tx.client.update({
        where: { id: client.id },
        data: {
          reminderDate: nextDateTime,
          ...(data.note !== undefined && { reminderNote: data.note ?? null }),
        },
      })
    }
  })

  return getClientCustomerReminderById(businessId, clientId, reminderId)
}

export async function deleteClientCustomerReminderById(
  businessId: string,
  clientId: string,
  reminderId: string
) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true, reminderDate: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const existing = await prisma.reminderLog.findFirst({
    where: { id: reminderId, businessId, clientId: client.id, reminderType: 'CLIENT_FOLLOW_UP' },
    select: { id: true, sentAt: true },
  })
  if (!existing) {
    throw new ClientReminderNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.reminderLog.delete({ where: { id: existing.id } })
    if (client.reminderDate != null && client.reminderDate.getTime() === existing.sentAt.getTime()) {
      await tx.client.update({
        where: { id: client.id },
        data: { reminderDate: null, reminderNote: null },
      })
    }
  })
}
