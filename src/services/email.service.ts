import { Resend } from 'resend'
import { appEventEmitter, type MailEvent } from '../lib/event-emitter'

// Lazy initialization to avoid errors if API key is missing
let resend: Resend | null = null

function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY is not set. Please add it to your .env file. Get your API key from https://resend.com'
      )
    }
    resend = new Resend(apiKey)
  }
  return resend
}

// Email queue with rate limiting
// Resend allows 2 requests per second, so we'll use 1.5 requests per second to be safe
const RATE_LIMIT_DELAY = 700 // milliseconds between requests (allows ~1.4 requests/second)
const MAX_RETRIES = 3
const RETRY_DELAY = 2000 // 2 seconds

interface QueuedEmail {
  options: SendEmailOptions
  resolve: () => void
  reject: (error: Error) => void
  retries: number
}

class EmailQueue {
  private queue: QueuedEmail[] = []
  private processing = false
  private lastSentTime = 0

  async enqueue(options: SendEmailOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        options,
        resolve,
        reject,
        retries: 0,
      })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    while (this.queue.length > 0) {
      const item = this.queue.shift()
      if (!item) {
        break
      }

      // Rate limiting: ensure at least RATE_LIMIT_DELAY ms between requests
      const timeSinceLastSend = Date.now() - this.lastSentTime
      if (timeSinceLastSend < RATE_LIMIT_DELAY) {
        const waitTime = RATE_LIMIT_DELAY - timeSinceLastSend
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }

      try {
        await this.sendEmail(item.options)
        this.lastSentTime = Date.now()
        item.resolve()
      } catch (error) {
        // Retry logic for rate limit errors
        if (
          error instanceof Error &&
          error.message.includes('Too many requests') &&
          item.retries < MAX_RETRIES
        ) {
          item.retries++
          console.log(
            `⏳ [EMAIL] Rate limit hit, retrying (${item.retries}/${MAX_RETRIES}) after ${RETRY_DELAY}ms...`
          )
          // Wait longer before retrying
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * item.retries))
          // Re-queue the item
          this.queue.unshift(item)
        } else {
          console.error('❌ [EMAIL] Failed to send email after retries:', error)
          item.reject(error as Error)
        }
      }
    }

    this.processing = false
  }

  private async sendEmail(options: SendEmailOptions): Promise<void> {
    // This will be called by the queue processor
    // We'll move the actual send logic here
    const recipients = (Array.isArray(options.to) ? options.to : [options.to])
      .map(email => {
        if (!email || typeof email !== 'string') {
          throw new Error(`Invalid email address: ${email}`)
        }
        return email.trim().toLowerCase()
      })
      .filter(email => {
        if (!email.includes('@')) {
          console.error('❌ [EMAIL] Invalid email format:', email)
          return false
        }
        return true
      })

    if (recipients.length === 0) {
      throw new Error('No valid email addresses provided')
    }

    const fromEmail = options.from || process.env.RESEND_FROM_EMAIL || 'no-reply@kellu.co'

    const client = getResendClient()
    const bccList = options.bcc
      ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc])
          .map(e => e.trim().toLowerCase())
          .filter(e => e.includes('@'))
      : undefined

    const result = await client.emails.send({
      from: fromEmail,
      to: recipients,
      ...(bccList?.length ? { bcc: bccList } : {}),
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments?.map(att => ({
        filename: att.filename,
        content: typeof att.content === 'string' ? Buffer.from(att.content) : att.content,
        contentType: att.contentType,
      })),
    })

    if (result.error) {
      const errorMessage = result.error.message || 'Unknown error from Resend API'
      const error = new Error(`Resend API error: ${errorMessage}`)
      throw error
    }
  }
}

const emailQueue = new EmailQueue()

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string | string[]
  bcc?: string | string[]
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

class EmailService {
  async send({ to, subject, html, from, replyTo, bcc, attachments }: SendEmailOptions): Promise<void> {
    // Normalize recipients - ensure they're valid email addresses
    const recipients = (Array.isArray(to) ? to : [to])
      .map(email => {
        if (!email || typeof email !== 'string') {
          throw new Error(`Invalid email address: ${email}`)
        }
        return email.trim().toLowerCase()
      })
      .filter(email => {
        if (!email.includes('@')) {
          console.error('❌ [EMAIL] Invalid email format:', email)
          return false
        }
        return true
      })

    if (recipients.length === 0) {
      throw new Error('No valid email addresses provided')
    }

    const fromEmail = from || process.env.RESEND_FROM_EMAIL || 'no-reply@kellu.co'

    console.log('📧 [EMAIL] EmailService.send called (queued):', {
      recipients,
      subject,
      from: fromEmail,
      htmlLength: html.length,
      hasApiKey: !!process.env.RESEND_API_KEY,
    })

    try {
      // Queue the email instead of sending immediately
      await emailQueue.enqueue({
        to: recipients,
        subject,
        html,
        from: fromEmail,
        replyTo,
        bcc,
        attachments,
      })

      console.log('✅ [EMAIL] Email successfully queued and sent to:', recipients.join(', '))
    } catch (error) {
      console.error('❌ [EMAIL] Failed to send email via Resend:', error)
      if (error instanceof Error) {
        console.error('❌ [EMAIL] Error message:', error.message)
        console.error('❌ [EMAIL] Error stack:', error.stack)
      }
      appEventEmitter.emitMailError(error as Error, { to, subject, html })
      throw error
    }
  }
}

export const emailService = new EmailService()

export function registerEmailListeners(): void {
  console.log('📧 [EMAIL] Registering email listeners...')
  appEventEmitter.onSendMail(async (eventData: MailEvent) => {
    console.log('📧 [EMAIL] mail:send event received:', {
      to: eventData.to,
      subject: eventData.subject,
      from: eventData.from,
      replyTo: eventData.replyTo,
      htmlLength: eventData.html?.length || 0,
    })
    try {
      // Don't await - let it queue and process asynchronously
      // This prevents blocking the main flow
      emailService
        .send({
          to: eventData.to,
          subject: eventData.subject,
          html: eventData.html || '',
          from: eventData.from,
          replyTo: eventData.replyTo,
          bcc: eventData.bcc,
          attachments: eventData.attachments,
        })
        .catch(error => {
          console.error('❌ [EMAIL] Failed to send email:', error)
          appEventEmitter.emitMailError(error as Error, eventData)
        })
      console.log('✅ [EMAIL] Email queued for sending')
    } catch (error) {
      console.error('❌ [EMAIL] Failed to queue email:', error)
      appEventEmitter.emitMailError(error as Error, eventData)
    }
  })
  console.log('✅ [EMAIL] Email listeners registered with rate limiting')
}
