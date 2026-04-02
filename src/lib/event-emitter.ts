import { EventEmitter } from 'node:events'

// Base data types for events
export type EmailTemplateData = Record<string, string | number | boolean | Date | null | undefined>
export type NotificationData = Record<string, string | number | boolean | Date | null | undefined>

// Event type definitions
export interface MailEvent {
  to: string | string[]
  subject: string
  template?: string
  html?: string
  text?: string
  data?: EmailTemplateData
  /** Sender "Display Name <email@domain.com>". Used for Kellu vs Client→Customer structure. */
  from?: string
  /** Reply-To address (e.g. equipo@kellu.co or client's company email). */
  replyTo?: string | string[]
  bcc?: string | string[]
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

/** Kelly: notification types per docs §3 */
export interface NotificationEvent {
  userId: string
  type:
    | 'BUSINESS_ACCOUNT_CREATED'
    | 'BUSINESS_REMINDER'
    | 'EMAIL_VERIFICATION_REQUIRED'
    | 'PASSWORD_RESET_REQUESTED'
    | 'ACCOUNT_SUSPENDED'
    | 'ACCOUNT_REACTIVATED'
  title: string
  message: string
  notificationType: 'SYSTEM' | 'USER' | 'PAYMENT' | 'ALERT'
  objectId: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  channels?: Array<'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH'>
  scheduledFor?: Date
  expiresAt?: Date
}

// Event emitter class with typed events
class TypedEventEmitter extends EventEmitter {
  // Mail events
  emitSendMail(eventData: MailEvent): boolean {
    return this.emit('mail:send', eventData)
  }

  // Notification events
  emitCreateNotification(eventData: NotificationEvent): boolean {
    return this.emit('notification:create', eventData)
  }

  // Utility methods for event listener management
  onSendMail(listener: (eventData: MailEvent) => void): this {
    return this.on('mail:send', listener)
  }

  // Error handling methods
  emitMailError(error: Error, eventData: MailEvent): boolean {
    return this.emit('mail:error', { error, eventData })
  }

  emitNotificationError(error: Error, eventData: NotificationEvent): boolean {
    return this.emit('notification:error', { error, eventData })
  }

  onMailError(listener: (data: { error: Error; eventData: MailEvent }) => void): this {
    return this.on('mail:error', listener)
  }

  onNotificationError(
    listener: (data: { error: Error; eventData: NotificationEvent }) => void
  ): this {
    return this.on('notification:error', listener)
  }
}

// Create and export a singleton instance
export const appEventEmitter = new TypedEventEmitter()

// Set max listeners to prevent memory leak warnings
appEventEmitter.setMaxListeners(50)

// Error handling for unhandled events
appEventEmitter.on('error', error => {
  console.error('Event emitter error:', error)
})

// Export types and event names for external usage
export const EVENT_NAMES = {
  MAIL: {
    SEND: 'mail:send',
    SEND_TEMPLATE: 'mail:send-template',
    ERROR: 'mail:error',
  },
  NOTIFICATION: {
    CREATE: 'notification:create',
    ERROR: 'notification:error',
  },
} as const

export type EventNames = typeof EVENT_NAMES

// Helper function to create batch operations
export const batchEmit = {
  sendMultipleMails: (mails: MailEvent[]): boolean[] => {
    return mails.map(mail => appEventEmitter.emitSendMail(mail))
  },

  createMultipleNotifications: (notifications: NotificationEvent[]): boolean[] => {
    return notifications.map(notification => appEventEmitter.emitCreateNotification(notification))
  },
}

export default appEventEmitter
