/**
 * Quote Management – quotes live on the `Quote` model (separate from `WorkOrder` jobs).
 * Line items use `LineItem.quoteId`. Quotes can optionally reference `workOrderId`.
 */

import { timingSafeEqual } from 'node:crypto'
import type { QuoteStatus } from '~/generated/prisma'
import { Prisma } from '~/generated/prisma'
import { renderEmailTemplate } from '~/lib/email-render'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import { clientToCustomerFrom } from '~/services/email-helpers'
import {
  isPlatformNotificationRuleActive,
  PlatformNotificationEventKey,
} from '~/services/platform-notification-rule.service'
import { resolveClientEmailCopyBcc } from '~/services/platform-settings.service'
import { ClientNotFoundError, WorkOrderNotFoundError } from '~/services/workorder.service'

// ─── Errors ──────────────────────────────────────────────────────────────────

export class QuoteAlreadySentError extends Error {
  constructor() {
    super('QUOTE_ALREADY_SENT')
  }
}

export class QuoteTerminalStateError extends Error {
  constructor() {
    super('QUOTE_IN_TERMINAL_STATE')
  }
}

export class QuoteNoLineItemsError extends Error {
  constructor() {
    super('QUOTE_NO_LINE_ITEMS')
  }
}

export class QuoteExpiredError extends Error {
  constructor() {
    super('QUOTE_EXPIRED')
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

// const BACKEND_PUBLIC_URL =
//   Bun.env.BACKEND_PUBLIC_URL?.trim() ||
//   Bun.env.BETTER_AUTH_URL?.trim() ||
//   `http://localhost:${Bun.env.PORT ?? Bun.env.PORT_NO ?? 8080}`

const TERMINAL_STATES: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuoteListFilters {
  search?: string
  quoteStatus?: QuoteStatus
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'scheduledAt'
  order?: 'asc' | 'desc'
}

export interface CreateQuoteInput {
  title: string
  clientId: string
  address: string
  assignedToId?: string | null
  instructions?: string | null
  workOrderId?: string | null
  quoteRequired?: boolean
  notes?: string | null
  quoteTermsConditions?: string | null
  lineItems?: Array<{
    name: string
    itemType?: 'SERVICE' | 'PRODUCT'
    description?: string | null
    quantity: number
    price: number
    cost?: number | null
    priceListItemId?: string | null
  }>
}

export interface UpdateQuoteInput {
  title?: string
  clientId?: string
  address?: string
  isScheduleLater?: boolean
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  assignedToId?: string | null
  workOrderId?: string | null
  quoteRequired?: boolean
  instructions?: string | null
  notes?: string | null
  quoteTermsConditions?: string | null
  discount?: number
  discountType?: 'PERCENTAGE' | 'AMOUNT' | null
  lineItems?: Array<{
    name: string
    itemType?: 'SERVICE' | 'PRODUCT'
    description?: string | null
    quantity: number
    price: number
    cost?: number | null
    priceListItemId?: string | null
  }>
}

// ─── Guard helpers ────────────────────────────────────────────────────────────

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

async function assertQuoteNotExpired(quoteId: string): Promise<void> {
  const row = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { quoteExpiresAt: true, quoteStatus: true, createdAt: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  if (row.quoteStatus === 'EXPIRED') {
    throw new QuoteExpiredError()
  }

  const expiryDate =
    row.quoteExpiresAt ??
    (() => {
      const fallback = new Date(row.createdAt)
      fallback.setDate(fallback.getDate() + 7)
      return fallback
    })()

  if (expiryDate < new Date()) {
    await prisma.quote.update({
      where: { id: quoteId },
      data: { quoteStatus: 'EXPIRED', quoteExpiredAt: new Date() },
    })
    throw new QuoteExpiredError()
  }
}

// ─── Quote number helper ──────────────────────────────────────────────────────

async function nextQuoteNumber(businessId: string): Promise<string> {
  const quotes = await prisma.quote.findMany({
    where: { businessId },
    select: { quoteNumber: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!quotes.length) {
    return '1'
  }

  const maxNum = quotes.reduce((max, q) => {
    if (!q.quoteNumber) {
      return max
    }
    const num = Number.parseInt(q.quoteNumber.replace(/^#/, ''), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0)

  return String(maxNum + 1)
}

// ─── DB fetch ─────────────────────────────────────────────────────────────────

const quoteDetailInclude = {
  client: {
    select: { id: true, name: true, email: true, phone: true, address: true },
  },
  assignedTo: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  lineItems: true,
  attachments: true,
  workOrder: { select: { id: true, workOrderNumber: true, title: true } },
} as const

async function getQuoteById(businessId: string, quoteId: string) {
  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: quoteDetailInclude,
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }
  return formatQuoteDetailResponse(q)
}

function formatQuoteDetailResponse(
  q: Prisma.QuoteGetPayload<{ include: typeof quoteDetailInclude }>
) {
  return {
    id: q.id,
    quoteId: q.id,
    quoteNumber: q.quoteNumber,
    workOrderId: q.workOrderId,
    workOrderNumber: q.workOrder?.workOrderNumber ?? null,
    title: q.title,
    address: q.address,
    instructions: q.instructions,
    notes: q.notes,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    isScheduleLater: q.isScheduleLater,
    isAnyTime: q.isAnyTime,
    scheduledAt: q.scheduledAt,
    startTime: q.startTime,
    endTime: q.endTime,
    clientId: q.clientId,
    businessId: q.businessId,
    assignedToId: q.assignedToId,
    quoteRequired: q.quoteRequired,
    quoteStatus: q.quoteStatus,
    quoteSentAt: q.quoteSentAt,
    quoteApprovedAt: q.quoteApprovedAt,
    quoteRejectedAt: q.quoteRejectedAt,
    quoteExpiredAt: q.quoteExpiredAt,
    quoteConvertedAt: q.quoteConvertedAt,
    quoteExpiresAt: q.quoteExpiresAt,
    lastQuotePdfUrl: q.lastQuotePdfUrl,
    quoteCorrelative: q.quoteCorrelative,
    quoteClientActionToken: q.quoteClientActionToken,
    quoteClientRespondedAt: q.quoteClientRespondedAt,
    quoteClientRejectionReason: q.quoteClientRejectionReason,
    quoteWhatsappStatus: q.quoteWhatsappStatus,
    quoteObservations: q.quoteObservations,
    quoteTermsConditions: q.quoteTermsConditions,
    quoteVersion: q.quoteVersion,
    subtotal: q.subtotal,
    discount: q.discount,
    discountType: q.discountType,
    tax: q.tax,
    total: q.total,
    cost: q.cost,
    amountPaid: q.amountPaid,
    balance: q.balance,
    lastJobReportPdfUrl: q.lastJobReportPdfUrl,
    client: q.client,
    assignedTo: q.assignedTo,
    lineItems: q.lineItems,
    payments: [] as const,
    expenses: [] as const,
    attachments: q.attachments,
  }
}

// ─── Financials ───────────────────────────────────────────────────────────────

function toNum(d: unknown): number {
  if (d == null) {
    return 0
  }
  if (typeof d === 'number') {
    return d
  }
  if (typeof d === 'string') {
    return Number.parseFloat(d) || 0
  }
  if (typeof d === 'object' && 'toNumber' in (d as object)) {
    return (d as { toNumber: () => number }).toNumber()
  }
  return 0
}

async function recalculateQuoteFinancials(
  quoteId: string,
  tx?: Omit<
    typeof prisma,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >
): Promise<void> {
  const db = tx ?? prisma
  const row = await db.quote.findUnique({
    where: { id: quoteId },
    select: { discount: true, discountType: true },
  })
  if (!row) {
    return
  }

  const lineItems = await db.lineItem.findMany({
    where: { quoteId },
    select: { quantity: true, price: true, cost: true },
  })

  let subtotal = 0
  let costTotal = 0
  for (const li of lineItems) {
    subtotal += li.quantity * toNum(li.price)
    costTotal += li.quantity * toNum(li.cost)
  }

  const discountVal = toNum(row.discount)
  const discountAmount =
    row.discountType === 'PERCENTAGE' ? (subtotal * discountVal) / 100 : discountVal
  const total = subtotal - discountAmount

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: new Prisma.Decimal(subtotal),
      cost: new Prisma.Decimal(costTotal),
      tax: new Prisma.Decimal(0),
      total: new Prisma.Decimal(total),
      amountPaid: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(total),
    },
  })
}

// ─── Update helpers ───────────────────────────────────────────────────────────

async function resolveWorkOrderId(
  workOrderId: string | null | undefined,
  businessId: string
): Promise<string | null | undefined> {
  if (workOrderId === undefined) {
    return undefined
  }
  if (workOrderId === null) {
    return null
  }

  const rel = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!rel) {
    throw new WorkOrderNotFoundError()
  }
  return rel.id
}

function buildScalarQuoteUpdateFields(input: UpdateQuoteInput): Prisma.QuoteUpdateInput {
  const data: Prisma.QuoteUpdateInput = {}
  if (input.title != null) {
    data.title = input.title
  }
  if (input.clientId != null) {
    data.client = input.clientId ? { connect: { id: input.clientId } } : undefined
  }
  if (input.address != null) {
    data.address = input.address
  }
  if (input.instructions !== undefined) {
    data.instructions = input.instructions
  }
  if (input.notes !== undefined) {
    data.notes = input.notes
  }
  if (input.isScheduleLater !== undefined) {
    data.isScheduleLater = input.isScheduleLater
  }
  if (input.scheduledAt !== undefined) {
    data.scheduledAt = input.scheduledAt
  }
  if (input.startTime !== undefined) {
    data.startTime = input.startTime
  }
  if (input.endTime !== undefined) {
    data.endTime = input.endTime
  }
  if (input.assignedToId !== undefined) {
    data.assignedTo = input.assignedToId
      ? { connect: { id: input.assignedToId } }
      : { disconnect: true }
  }
  if (input.quoteRequired !== undefined) {
    data.quoteRequired = input.quoteRequired
  }
  if (input.quoteTermsConditions !== undefined) {
    data.quoteTermsConditions = input.quoteTermsConditions
  }
  if (input.discountType !== undefined) {
    data.discountType = input.discountType
  }
  return data
}

function buildFinancialQuoteUpdateFields(input: UpdateQuoteInput): Prisma.QuoteUpdateInput {
  const data: Prisma.QuoteUpdateInput = {}
  if (input.discount !== undefined) {
    data.discount = new Prisma.Decimal(input.discount)
  }
  return data
}

function buildQuoteUpdateData(
  input: UpdateQuoteInput,
  workOrderId: string | null | undefined
): Prisma.QuoteUpdateInput {
  const data: Prisma.QuoteUpdateInput = {
    ...buildScalarQuoteUpdateFields(input),
    ...buildFinancialQuoteUpdateFields(input),
  }
  if (workOrderId !== undefined) {
    data.workOrder = workOrderId ? { connect: { id: workOrderId } } : { disconnect: true }
  }
  return data
}

function mapLineItemsForCreate(lineItems: CreateQuoteInput['lineItems'], quoteId: string) {
  return (lineItems ?? []).map(li => ({
    quoteId,
    name: li.name,
    itemType: li.itemType ?? ('SERVICE' as const),
    description: li.description ?? null,
    quantity: li.quantity,
    price: li.price,
    cost: li.cost ?? null,
    priceListItemId: li.priceListItemId ?? null,
  }))
}

// ─── List helpers ─────────────────────────────────────────────────────────────

function buildQuoteWhereInput(
  businessId: string,
  filters: QuoteListFilters
): Prisma.QuoteWhereInput {
  const where: Prisma.QuoteWhereInput = { businessId }
  if (filters.quoteStatus) {
    where.quoteStatus = filters.quoteStatus
  }

  const term = filters.search?.trim()
  if (term) {
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { address: { contains: term, mode: 'insensitive' } },
      { client: { name: { contains: term, mode: 'insensitive' } } },
    ]
  }
  return where
}

function mapQuoteListRow(q: {
  id: string
  quoteNumber: string | null
  title: string
  address: string
  createdAt: Date
  updatedAt: Date
  quoteStatus: QuoteStatus
  quoteVersion: number
  quoteSentAt: Date | null
  quoteExpiresAt: Date | null
  total: Prisma.Decimal | null
  workOrderId: string | null
  workOrder: { id: string; workOrderNumber: string | null; title: string } | null
  quoteRequired: boolean
  client: { id: string; name: string; email: string | null; phone: string }
  assignedTo: { id: string; user: { name: string | null; email: string } } | null
  lineItems: { id: string; name: string; quantity: number; price: Prisma.Decimal }[]
}) {
  const workOrderName = [q.quoteNumber, q.title].filter(Boolean).join(' — ')
  return {
    id: q.id,
    quoteId: q.id,
    quoteNumber: q.quoteNumber,
    workOrderId: q.workOrderId,
    workOrderNumber: q.workOrder?.workOrderNumber ?? null,
    quoteRequired: q.quoteRequired,
    workOrderName: workOrderName || q.title,
    title: q.title,
    address: q.address,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    quoteStatus: q.quoteStatus,
    quoteVersion: q.quoteVersion,
    quoteSentAt: q.quoteSentAt,
    quoteExpiresAt: q.quoteExpiresAt,
    total: q.total,
    client: q.client,
    assignedTo: q.assignedTo,
    lineItems: q.lineItems.map(li => ({
      id: li.id,
      name: li.name,
      quantity: li.quantity,
      price: li.price,
    })),
  }
}

// ─── Email format helpers ─────────────────────────────────────────────────────

function formatQuoteDate(d: Date | null | undefined): string {
  if (!d) {
    return 'To be confirmed'
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function normalizeTimeDisplay(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') {
    return null
  }
  const s = String(value).trim()
  const date = new Date(s)
  if (!Number.isNaN(date.getTime()) && s.includes('T')) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) {
    return s.length === 5 ? s : s.slice(0, 5)
  }
  return s
}

function formatQuoteTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
  scheduledAt?: Date | null
): string {
  const startNorm = normalizeTimeDisplay(start)
  const endNorm = normalizeTimeDisplay(end)
  if (startNorm && endNorm) {
    return `${startNorm} - ${endNorm}`
  }
  if (startNorm || endNorm) {
    return startNorm ?? endNorm ?? 'To be confirmed'
  }
  if (scheduledAt) {
    return scheduledAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  return 'To be confirmed'
}

function formatMoney(value: unknown): string {
  if (value == null) {
    return ''
  }
  return `$${Number(value).toFixed(2)}`
}

function summarizeQuoteLineItems(
  lineItems: Array<{ name: string; quantity: number; price: unknown }>
): string {
  return lineItems
    .map(
      li =>
        `${li.name} x ${li.quantity} @ ${formatMoney(li.price)} = ${formatMoney(Number(li.quantity) * Number(li.price ?? 0))}`
    )
    .join('\n')
}

// ─── Token helpers ────────────────────────────────────────────────────────────

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

async function resolveQuoteActionToken(
  quoteId: string,
  existingToken: string | null
): Promise<string> {
  if (existingToken) {
    return existingToken
  }
  const token = crypto.randomUUID().replace(/-/g, '')
  await prisma.quote.update({
    where: { id: quoteId },
    data: { quoteClientActionToken: token },
  })
  return token
}

export async function getOrCreateQuoteActionToken(
  businessId: string,
  quoteId: string
): Promise<string> {
  await ensureBusinessExists(businessId)

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, quoteClientActionToken: true },
  })
  if (!quote) {
    throw new WorkOrderNotFoundError()
  }

  return resolveQuoteActionToken(quote.id, quote.quoteClientActionToken)
}

// function buildClientQuoteActionUrl(
//   token: string,
//   action: 'approve' | 'reject',
//   quoteId: string
// ): string {
//   const base = BACKEND_PUBLIC_URL.replace(/\/$/, '')
//   const u = new URL(`${base}/api/quotes/client/respond`)
//   u.searchParams.set('action', action)
//   u.searchParams.set('token', token)
//   u.searchParams.set('quoteId', quoteId)
//   return u.toString()
// }

// ─── Token lookup sub-helpers (extracted to reduce cognitive complexity) ──────

const clientActionTokenBaseSelect = {
  id: true,
  quoteStatus: true,
  businessId: true,
  clientId: true,
  quoteCorrelative: true,
} as const

type QuoteTokenRow = {
  id: string
  quoteStatus: QuoteStatus
  businessId: string
  clientId: string
  quoteCorrelative: string | null
}

async function findQuoteRowByToken(normalized: string): Promise<QuoteTokenRow | null> {
  return prisma.quote.findFirst({
    where: { quoteClientActionToken: normalized },
    select: clientActionTokenBaseSelect,
  })
}

async function findQuoteRowByHintedId(
  normalized: string,
  quoteIdHint: string
): Promise<QuoteTokenRow | null> {
  const hinted = await prisma.quote.findFirst({
    where: { id: quoteIdHint.trim() },
    select: { ...clientActionTokenBaseSelect, quoteClientActionToken: true },
  })

  if (!hinted?.quoteClientActionToken) {
    return null
  }
  if (!safeEqualStrings(hinted.quoteClientActionToken, normalized)) {
    return null
  }

  const { quoteClientActionToken: _t, ...rest } = hinted
  return rest
}

async function findQuoteRowByClientActionToken(
  token: string,
  quoteIdHint?: string | null
): Promise<QuoteTokenRow | null> {
  const normalized = token.trim()
  if (!normalized) {
    return null
  }

  const row = await findQuoteRowByToken(normalized)
  if (row) {
    return row
  }

  if (!quoteIdHint?.trim()) {
    return null
  }

  return findQuoteRowByHintedId(normalized, quoteIdHint)
}

// ─── Attachment helpers ───────────────────────────────────────────────────────

async function fetchUrlAsBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('ATTACHMENT_FETCH_FAILED')
  }
  return Buffer.from(await response.arrayBuffer())
}

function createAttachmentCollector(maxBytes = 10 * 1024 * 1024) {
  const payload: Array<{ filename: string; content: Buffer; contentType?: string }> = []
  let totalBytes = 0

  return {
    push(filename: string, content: Buffer, contentType?: string) {
      totalBytes += content.byteLength
      if (totalBytes > maxBytes) {
        throw new Error('ATTACHMENTS_TOO_LARGE')
      }
      payload.push({ filename, content, contentType })
    },
    get payload() {
      return payload
    },
  }
}

async function collectBuiltInAttachments(
  q: { lastQuotePdfUrl: string | null; lastJobReportPdfUrl: string | null },
  selectedIds: Set<string>,
  push: (filename: string, content: Buffer, contentType: string) => void
): Promise<void> {
  const builtIn = [
    q.lastQuotePdfUrl && { id: 'quote_pdf', filename: 'Quote.pdf', url: q.lastQuotePdfUrl },
    q.lastJobReportPdfUrl && {
      id: 'work_order_summary_pdf',
      filename: 'Work order summary.pdf',
      url: q.lastJobReportPdfUrl,
    },
  ].filter(Boolean) as Array<{ id: string; filename: string; url: string }>

  for (const item of builtIn) {
    if (!selectedIds.has(item.id)) {
      continue
    }
    const content = await fetchUrlAsBuffer(item.url)
    push(item.filename, content, 'application/pdf')
  }
}

async function collectQuoteAttachments(
  quoteId: string,
  selectedIds: Set<string>,
  push: (filename: string, content: Buffer, contentType?: string) => void
): Promise<void> {
  if (selectedIds.size === 0) {
    return
  }

  const items = await prisma.quoteAttachment.findMany({
    where: { quoteId },
    select: { id: true, url: true, filename: true, type: true },
  })

  for (const item of items) {
    if (!selectedIds.has(`qa_${item.id}`)) {
      continue
    }
    const content = await fetchUrlAsBuffer(item.url)
    push(item.filename ?? 'Attachment', content, item.type ?? undefined)
  }
}

async function buildQuoteEmailAttachmentList(
  quoteId: string,
  q: { lastQuotePdfUrl: string | null; lastJobReportPdfUrl: string | null }
) {
  type Entry = {
    id: string
    label: string
    filename: string
    source: 'QUOTE_PDF' | 'JOB_REPORT_PDF' | 'WORK_ORDER_ATTACHMENT'
    sizeBytes: number | null
    selectedByDefault: boolean
  }

  const attachments: Entry[] = []

  if (q.lastQuotePdfUrl) {
    attachments.push({
      id: 'quote_pdf',
      label: 'Quote.pdf',
      filename: 'Quote.pdf',
      source: 'QUOTE_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }
  if (q.lastJobReportPdfUrl) {
    attachments.push({
      id: 'work_order_summary_pdf',
      label: 'Work order summary.pdf',
      filename: 'Work order summary.pdf',
      source: 'JOB_REPORT_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }

  const quoteAttachments = await prisma.quoteAttachment.findMany({
    where: { quoteId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, filename: true },
  })

  for (const item of quoteAttachments) {
    attachments.push({
      id: `qa_${item.id}`,
      label: item.filename ?? 'Attachment',
      filename: item.filename ?? 'Attachment',
      source: 'WORK_ORDER_ATTACHMENT',
      sizeBytes: null,
      selectedByDefault: false,
    })
  }

  return attachments
}

// ─── Rejection notification ───────────────────────────────────────────────────

function appendQuoteActionButtons(html: string, approveUrl: string, rejectUrl: string): string {
  const buttons = `
  <div style="margin-top:24px;text-align:center;">
    <a href="${approveUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin-right:8px;">Approve Quote</a>
    <a href="${rejectUrl}"  style="display:inline-block;background:#ef4444;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Reject Quote</a>
  </div>`
  return html.includes('</body>')
    ? html.replace('</body>', `${buttons}</body>`)
    : `${html}${buttons}`
}

async function sendQuoteRejectedByClientNotification(params: {
  quoteId: string
  rejectionReason: string
}): Promise<void> {
  const q = await prisma.quote.findFirst({
    where: { id: params.quoteId },
    include: {
      client: { select: { name: true } },
      business: { include: { settings: { select: { notificationEmail: true } } } },
    },
  })
  if (!q) {
    return
  }

  const toEmail = q.business.settings?.notificationEmail?.trim() || q.business.email?.trim()
  if (!toEmail) {
    console.warn('[quote] No business email for quote rejection notification', q.id)
    return
  }

  const displayName = q.business.name?.trim() || 'Company'
  const noReply = Bun.env.RESEND_FROM_EMAIL?.trim() || 'noresponder@notificaciones.kellu.co'
  const kelluName = Bun.env.RESEND_KELLU_FROM_NAME?.trim() || 'Kellu'
  const replyTo = Bun.env.RESEND_KELLU_REPLY_TO?.trim() || 'equipo@kellu.co'
  const base = (Bun.env.FRONTEND_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '')

  const html = await renderEmailTemplate('quote-rejected-by-client', {
    businessName: displayName,
    clientName: q.client.name,
    quoteNumber: q.quoteNumber ?? `#${q.id}`,
    quoteReference: q.quoteCorrelative ?? undefined,
    title: q.title,
    rejectionReason: params.rejectionReason,
    logoUrl: q.business.logoUrl ?? undefined,
    dashboardUrl: `${base}/dashboard`,
  })

  await emailService.send({
    to: toEmail,
    subject: `Quote rejected by client — ${q.quoteCorrelative?.trim() || q.title}`,
    html,
    from: `${kelluName} <${noReply}>`,
    replyTo,
  })
}

// ─── Numeric helper ───────────────────────────────────────────────────────────

function numericFromDb(v: unknown): number | null {
  if (v == null) {
    return null
  }
  if (typeof v === 'number') {
    return v
  }
  if (
    typeof v === 'object' &&
    v !== null &&
    'toNumber' in v &&
    typeof (v as { toNumber: unknown }).toNumber === 'function'
  ) {
    try {
      return (v as { toNumber: () => number }).toNumber()
    } catch {
      return Number(v)
    }
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ─── sendQuoteEmail helpers ───────────────────────────────────────────────────

type QuoteEmailRow = {
  id: string
  quoteNumber: string | null
  quoteCorrelative: string | null
  title: string
  address: string | null
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  total: unknown
  business: { name: string | null; logoUrl?: string | null }
  client: { name: string }
  assignedTo: { user: { name: string | null } } | null
  lineItems: Array<{ name: string; quantity: number; price: unknown }>
}

async function buildQuoteHtmlBody(
  q: QuoteEmailRow,
  approveUrl: string,
  rejectUrl: string,
  overrideMessage?: string
): Promise<string> {
  if (overrideMessage) {
    return appendQuoteActionButtons(overrideMessage, approveUrl, rejectUrl)
  }

  const displayName = q.business.name?.trim() || 'Company'
  return renderEmailTemplate('quote-created', {
    clientName: q.client.name,
    businessName: displayName,
    quoteNumber: q.quoteNumber ?? `#${q.id}`,
    quoteReference: q.quoteCorrelative ?? undefined,
    title: q.title,
    address: q.address ?? 'To be confirmed',
    date: formatQuoteDate(q.scheduledAt),
    timeRange: formatQuoteTimeRange(q.startTime, q.endTime, q.scheduledAt),
    assignedTeamMemberName: q.assignedTo?.user?.name ?? 'Our team',
    lineItemsSummary: summarizeQuoteLineItems(q.lineItems),
    total: formatMoney(q.total),
    logoUrl: q.business.logoUrl ?? undefined,
    approveUrl,
    rejectUrl,
  })
}

async function collectEmailAttachments(
  quoteId: string,
  q: { lastQuotePdfUrl: string | null; lastJobReportPdfUrl: string | null },
  selectedAttachmentIds: string[],
  additionalAttachments: Array<{ filename: string; content: Buffer; contentType?: string | null }>
) {
  const selectedIds = new Set(selectedAttachmentIds)
  const collector = createAttachmentCollector()

  await collectBuiltInAttachments(q, selectedIds, collector.push)
  await collectQuoteAttachments(quoteId, selectedIds, collector.push)

  for (const item of additionalAttachments) {
    collector.push(item.filename, item.content, item.contentType ?? undefined)
  }

  return collector.payload
}

async function maybeSendCopyEmail(params: {
  sendMeCopy: boolean | undefined
  requesterEmail: string | undefined
  subject: string
  html: string
  from: string
  replyTo: string | undefined
  attachments: Array<{ filename: string; content: Buffer; contentType?: string }>
}): Promise<void> {
  if (!params.sendMeCopy || !params.requesterEmail?.trim()) {
    return
  }

  await emailService.send({
    to: params.requesterEmail.trim(),
    subject: `[Copy] ${params.subject}`,
    html: params.html,
    from: params.from,
    replyTo: params.replyTo,
    attachments: params.attachments,
  })
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function listQuotes(businessId: string, filters: QuoteListFilters = {}) {
  await ensureBusinessExists(businessId)

  const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = filters
  const skip = (page - 1) * limit
  const where = buildQuoteWhereInput(businessId, filters)

  const [rows, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      select: {
        id: true,
        quoteNumber: true,
        title: true,
        address: true,
        createdAt: true,
        updatedAt: true,
        quoteStatus: true,
        quoteVersion: true,
        quoteSentAt: true,
        quoteExpiresAt: true,
        total: true,
        workOrderId: true,
        workOrder: { select: { id: true, workOrderNumber: true, title: true } },
        quoteRequired: true,
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedTo: { select: { id: true, user: { select: { name: true, email: true } } } },
        lineItems: { select: { id: true, name: true, quantity: true, price: true } },
      },
    }),
    prisma.quote.count({ where }),
  ])

  return {
    quotes: rows.map(mapQuoteListRow),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export async function createQuote(businessId: string, input: CreateQuoteInput) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const workOrderId = (await resolveWorkOrderId(input.workOrderId, businessId)) ?? null

  const quoteNumber = `#${await nextQuoteNumber(businessId)}`
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteTermsConditions: true, quoteExpirationDays: true },
  })

  const created = await prisma.$transaction(async tx => {
    const q = await tx.quote.create({
      data: {
        businessId,
        clientId: input.clientId,
        title: input.title,
        address: input.address,
        instructions: input.instructions ?? null,
        notes: input.notes ?? null,
        assignedToId: input.assignedToId ?? null,
        workOrderId,
        ...(input.quoteRequired === true && { quoteRequired: true }),
        quoteNumber,
        quoteStatus: 'NOT_SENT',
        quoteTermsConditions: input.quoteTermsConditions ?? settings?.quoteTermsConditions ?? null,
        isScheduleLater: true,
        discount: new Prisma.Decimal(0),
        discountType: null,
      },
    })

    const items = mapLineItemsForCreate(input.lineItems, q.id)
    if (items.length) {
      await tx.lineItem.createMany({ data: items })
    }

    await recalculateQuoteFinancials(q.id, tx)
    return q
  })

  return getQuoteById(businessId, created.id)
}

export async function getQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)
  return getQuoteById(businessId, quoteId)
}

export async function getQuoteRejectionReason(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)
  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: {
      id: true,
      quoteStatus: true,
      quoteClientRejectionReason: true,
      quoteRejectedAt: true,
      quoteClientRespondedAt: true,
    },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  return {
    quoteId: row.id,
    quoteStatus: row.quoteStatus,
    rejectionReason: row.quoteClientRejectionReason,
    quoteRejectedAt: row.quoteRejectedAt,
    quoteClientRespondedAt: row.quoteClientRespondedAt,
  }
}

export async function updateQuote(businessId: string, quoteId: string, input: UpdateQuoteInput) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new WorkOrderNotFoundError()
  }

  const workOrderId = await resolveWorkOrderId(input.workOrderId, businessId)

  await prisma.$transaction(async tx => {
    await tx.quote.update({
      where: { id: quoteId },
      data: buildQuoteUpdateData(input, workOrderId),
    })

    if (input.lineItems) {
      await tx.lineItem.deleteMany({ where: { quoteId } })
      const items = mapLineItemsForCreate(input.lineItems, quoteId)
      if (items.length) {
        await tx.lineItem.createMany({ data: items })
      }
    }

    await recalculateQuoteFinancials(quoteId, tx)
  })

  return getQuoteById(businessId, quoteId)
}

export async function updateQuoteStatus(
  businessId: string,
  quoteId: string,
  quoteStatus: QuoteStatus
) {
  await ensureBusinessExists(businessId)

  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }

  const now = new Date()
  const data: Prisma.QuoteUpdateInput = { quoteStatus }
  if (quoteStatus === 'AWAITING_RESPONSE') {
    const settings = await prisma.businessSettings.findUnique({
      where: { businessId },
      select: { quoteExpirationDays: true },
    })
    const expirationDays = settings?.quoteExpirationDays ?? 7
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + expirationDays)
    data.quoteSentAt = now
    data.quoteExpiresAt = expiresAt
  }
  if (quoteStatus === 'APPROVED') {
    data.quoteApprovedAt = now
  }
  if (quoteStatus === 'REJECTED') {
    data.quoteRejectedAt = now
  }
  if (quoteStatus === 'EXPIRED') {
    data.quoteExpiredAt = now
  }
  if (quoteStatus === 'CONVERTED') {
    data.quoteConvertedAt = now
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data,
  })

  return getQuoteById(businessId, quoteId)
}

export async function deleteQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new WorkOrderNotFoundError()
  }

  await prisma.quote.delete({ where: { id: quoteId } })
}

export async function setQuoteAwaitingResponse(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, quoteStatus: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  if (row.quoteStatus !== 'NOT_SENT') {
    throw new QuoteTerminalStateError()
  }

  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteExpirationDays: true },
  })
  const expirationDays = settings?.quoteExpirationDays ?? 7
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + expirationDays)

  await prisma.quote.update({
    where: { id: quoteId },
    data: { quoteStatus: 'AWAITING_RESPONSE', quoteSentAt: now, quoteExpiresAt: expiresAt },
  })

  return getQuoteById(businessId, quoteId)
}

export async function sendQuote(
  businessId: string,
  quoteId: string,
  options?: { observations?: string }
) {
  await ensureBusinessExists(businessId)

  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: { lineItems: { select: { id: true } } },
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }
  if (TERMINAL_STATES.includes(q.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  const lineItemCount = await prisma.lineItem.count({ where: { quoteId } })
  if (lineItemCount === 0) {
    throw new QuoteNoLineItemsError()
  }

  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteExpirationDays: true },
  })
  const expirationDays = settings?.quoteExpirationDays ?? 7
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + expirationDays)

  const currentVersion = q.quoteVersion ?? 1
  const newVersion = q.quoteSentAt ? currentVersion + 1 : currentVersion
  const quoteCorrelative = `Q-${quoteId.slice(-4)}-${now.toISOString().slice(0, 10)}-v${newVersion}`

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      quoteStatus: 'AWAITING_RESPONSE',
      quoteSentAt: now,
      quoteExpiresAt: expiresAt,
      quoteVersion: newVersion,
      quoteCorrelative,
      ...(options?.observations && { quoteObservations: options.observations }),
    },
  })

  return getQuoteById(businessId, quoteId)
}

export async function sendQuoteEmail(
  businessId: string,
  quoteId: string,
  options?: {
    from?: string
    replyTo?: string
    subject?: string
    message?: string
    to?: string
    sendMeCopy?: boolean
    sendViaWhatsapp?: boolean
    selectedAttachmentIds?: string[]
    additionalAttachments?: Array<{
      filename: string
      content: Buffer
      contentType?: string | null
    }>
    requesterEmail?: string
    approveUrl?: string // ✅ received from handler
    rejectUrl?: string // ✅ received from handler
  }
) {
  await ensureBusinessExists(businessId)

  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      assignedTo: { include: { user: { select: { name: true } } } },
      lineItems: { select: { name: true, quantity: true, price: true } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }

  const toEmail = (options?.to ?? q.client.email)?.trim()
  if (!toEmail) {
    throw new Error('Client has no email address. Add an email to the client to send the quote.')
  }

  const displayName = q.business.name?.trim() || 'Company'
  const companyReplyTo =
    options?.replyTo?.trim() || q.business.settings?.replyToEmail?.trim() || q.business.email
  const fromHeader = options?.from?.trim() || clientToCustomerFrom(displayName)
  const subject =
    options?.subject ?? `Quote from ${displayName} - ${q.title} ${q.quoteCorrelative ?? ''}`.trim()

  // ✅ Save token to DB (still needed for clientRespondGet lookup)
  await resolveQuoteActionToken(q.id, q.quoteClientActionToken)

  // ✅ Use URLs passed from handler
  const approveUrl = options?.approveUrl ?? ''
  const rejectUrl = options?.rejectUrl ?? ''

  const html = await buildQuoteHtmlBody(q, approveUrl, rejectUrl, options?.message)
  const attachments = await collectEmailAttachments(
    quoteId,
    q,
    options?.selectedAttachmentIds ?? [],
    options?.additionalAttachments ?? []
  )
  const platformBcc = await resolveClientEmailCopyBcc()

  await emailService.send({
    to: toEmail,
    subject,
    html,
    from: fromHeader,
    replyTo: companyReplyTo,
    ...(platformBcc ? { bcc: platformBcc } : {}),
    attachments,
  })

  await maybeSendCopyEmail({
    sendMeCopy: options?.sendMeCopy,
    requesterEmail: options?.requesterEmail,
    subject,
    html,
    from: fromHeader,
    replyTo: companyReplyTo,
    attachments,
  })

  if (options?.sendViaWhatsapp !== undefined) {
    await prisma.quote.update({
      where: { id: quoteId },
      data: { quoteWhatsappStatus: options.sendViaWhatsapp ? 'PENDING' : null },
    })
  }

  return getQuoteById(businessId, quoteId)
}

export async function getQuoteEmailComposeData(
  businessId: string,
  quoteId: string,
  urls: { approveUrl: string; rejectUrl: string } // ✅ from handler
) {
  await ensureBusinessExists(businessId)

  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      assignedTo: { include: { user: { select: { name: true } } } },
      lineItems: { select: { name: true, quantity: true, price: true } },
      business: {
        include: {
          settings: { select: { replyToEmail: true, sendQuoteWhatsappDefault: true } },
        },
      },
    },
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }

  const displayName = q.business.name?.trim() || 'Company'
  const replyTo = q.business.settings?.replyToEmail?.trim() || q.business.email
  const subject = `Quote from ${displayName} - ${q.title} ${q.quoteCorrelative ?? ''}`.trim()

  // ✅ Still save token to DB for clientRespondGet lookup
  await resolveQuoteActionToken(q.id, q.quoteClientActionToken)

  const message = await renderEmailTemplate('quote-created', {
    clientName: q.client.name,
    businessName: displayName,
    quoteNumber: q.quoteNumber ?? `#${q.id}`,
    quoteReference: q.quoteCorrelative ?? undefined,
    title: q.title,
    address: q.address ?? 'To be confirmed',
    date: formatQuoteDate(q.scheduledAt),
    timeRange: formatQuoteTimeRange(q.startTime, q.endTime, q.scheduledAt),
    assignedTeamMemberName: q.assignedTo?.user?.name ?? 'Our team',
    lineItemsSummary: summarizeQuoteLineItems(q.lineItems),
    total: formatMoney(q.total),
    logoUrl: q.business.logoUrl ?? undefined,
    approveUrl: urls.approveUrl, // ✅ from handler
    rejectUrl: urls.rejectUrl, // ✅ from handler
  })

  const attachments = await buildQuoteEmailAttachmentList(quoteId, q)

  return {
    quoteId: q.id,
    from: clientToCustomerFrom(displayName),
    replyTo,
    to: q.client.email ?? null,
    subject,
    message,
    sendMeCopyDefault: false,
    sendViaWhatsappDefault: q.business.settings?.sendQuoteWhatsappDefault ?? false,
    maxAdditionalAttachmentsBytes: 10 * 1024 * 1024,
    attachments,
  }
}

export async function getPublicQuoteViewForClient(quoteId: string, token: string) {
  const row = await findQuoteRowByClientActionToken(token.trim(), quoteId)
  if (!row || row.id !== quoteId) {
    throw new WorkOrderNotFoundError()
  }

  const q = await prisma.quote.findFirst({
    where: { id: row.id },
    select: {
      id: true,
      workOrderId: true,
      quoteNumber: true,
      quoteCorrelative: true,
      title: true,
      address: true,
      quoteStatus: true,
      quoteSentAt: true,
      quoteExpiresAt: true,
      subtotal: true,
      discount: true,
      tax: true,
      total: true,
      quoteTermsConditions: true,
      lineItems: {
        select: {
          id: true,
          name: true,
          itemType: true,
          description: true,
          quantity: true,
          price: true,
        },
      },
      client: { select: { name: true } },
      business: { select: { name: true } },
    },
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }

  return {
    id: q.id,
    quoteId: q.id,
    workOrderId: q.workOrderId,
    quoteNumber: q.quoteNumber,
    workOrderNumber: null,
    title: q.title,
    address: q.address,
    quoteStatus: q.quoteStatus,
    quoteSentAt: q.quoteSentAt,
    quoteExpiresAt: q.quoteExpiresAt,
    subtotal: numericFromDb(q.subtotal),
    discount: numericFromDb(q.discount),
    tax: numericFromDb(q.tax),
    total: numericFromDb(q.total),
    quoteTermsConditions: q.quoteTermsConditions,
    client: q.client,
    businessName: q.business.name,
    lineItems: q.lineItems.map(li => ({
      id: li.id,
      name: li.name,
      itemType: li.itemType,
      description: li.description,
      quantity: li.quantity,
      price: numericFromDb(li.price) ?? 0,
    })),
  }
}

export async function clientApproveQuoteByToken(token: string, quoteIdHint?: string | null) {
  const row = await findQuoteRowByClientActionToken(token, quoteIdHint)
  if (!row) {
    throw new WorkOrderNotFoundError()
  }

  await assertQuoteNotExpired(row.id)
  if (TERMINAL_STATES.includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.quote.update({
    where: { id: row.id },
    data: {
      quoteStatus: 'APPROVED',
      quoteApprovedAt: new Date(),
      quoteClientRespondedAt: new Date(),
      quoteClientRejectionReason: null,
    },
  })
  return row
}

export async function resolveClientRejectFormQuote(
  token: string,
  quoteIdHint?: string | null
): Promise<
  { ok: true; quoteId: string } | { ok: false; kind: 'not_found' | 'terminal' | 'expired' }
> {
  const row = await findQuoteRowByClientActionToken(token, quoteIdHint)
  if (!row) {
    return { ok: false, kind: 'not_found' }
  }

  try {
    await assertQuoteNotExpired(row.id)
  } catch (e) {
    if (e instanceof QuoteExpiredError) {
      return { ok: false, kind: 'expired' }
    }
    throw e
  }

  if (TERMINAL_STATES.includes(row.quoteStatus)) {
    return { ok: false, kind: 'terminal' }
  }
  return { ok: true, quoteId: row.id }
}

export async function clientRejectQuoteByQuoteId(quoteId: string, reason: string, token: string) {
  const row = await findQuoteRowByClientActionToken(token.trim(), quoteId)
  if (!row || row.id !== quoteId) {
    throw new WorkOrderNotFoundError()
  }

  await assertQuoteNotExpired(row.id)
  if (TERMINAL_STATES.includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.quote.update({
    where: { id: row.id },
    data: {
      quoteStatus: 'REJECTED',
      quoteRejectedAt: new Date(),
      quoteClientRespondedAt: new Date(),
      quoteClientRejectionReason: reason.trim(),
    },
  })

  try {
    if (
      await isPlatformNotificationRuleActive(PlatformNotificationEventKey.QUOTE_REJECTED_BY_CLIENT)
    ) {
      await sendQuoteRejectedByClientNotification({
        quoteId: row.id,
        rejectionReason: reason.trim(),
      })
    }
  } catch (err) {
    console.error('[quote] Failed to notify business of client quote rejection:', err)
  }

  return row
}

export async function approveQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, quoteStatus: true, quoteExpiresAt: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  if (row.quoteStatus === 'EXPIRED' || (row.quoteExpiresAt && row.quoteExpiresAt < new Date())) {
    throw new QuoteExpiredError()
  }
  if (['CONVERTED', 'REJECTED'].includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: { quoteStatus: 'APPROVED', quoteApprovedAt: new Date() },
  })

  return getQuoteById(businessId, quoteId)
}

export async function rejectQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, quoteStatus: true, quoteExpiresAt: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  if (row.quoteStatus === 'EXPIRED' || (row.quoteExpiresAt && row.quoteExpiresAt < new Date())) {
    throw new QuoteExpiredError()
  }
  if (['CONVERTED', 'REJECTED'].includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: { quoteStatus: 'REJECTED', quoteRejectedAt: new Date() },
  })

  return getQuoteById(businessId, quoteId)
}

export async function convertQuoteIfEligible(
  _businessId: string,
  _workOrderId: string
): Promise<void> {
  // Automatic quote conversion is disabled in the current flow.
}

export async function expireOverdueQuotes(): Promise<number> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const result = await prisma.quote.updateMany({
    where: {
      quoteStatus: { in: ['NOT_SENT', 'AWAITING_RESPONSE'] },
      OR: [
        { quoteExpiresAt: { lt: new Date() } },
        { quoteExpiresAt: null, createdAt: { lt: sevenDaysAgo } },
      ],
    },
    data: { quoteStatus: 'EXPIRED', quoteExpiredAt: new Date() },
  })
  return result.count
}

export async function getQuoteOverview(businessId: string) {
  await ensureBusinessExists(businessId)

  const counts = await prisma.quote.groupBy({
    by: ['quoteStatus'],
    where: { businessId },
    _count: { id: true },
  })

  return counts.map(c => ({ status: c.quoteStatus, count: c._count.id }))
}
