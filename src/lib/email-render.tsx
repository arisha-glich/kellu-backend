/** @jsxImportSource react */

import { render } from '@react-email/components'
import { AddBusinessEmail } from '../emails/admin/add.business'
import { AddTeamMemberEmail } from '../emails/admin/add.team-member'
import { BookingConfirmationEmail } from '../emails/booking-confirmation'
import { EmailVerification } from '../emails/email.verification'
import { InvoiceAssignedTeamEmail } from '../emails/invoice-assigned-team'
import { InvoiceCreatedClientEmail } from '../emails/invoice-created-client'
import { QuoteCreatedEmail } from '../emails/quote-created'
import { QuoteRejectedByClientEmail } from '../emails/quote-rejected-by-client'
import { SettingsUpdatedEmail } from '../emails/settings-updated'
import { TaskAssignedTeamEmail } from '../emails/task-assigned-team'
import { TaskCreatedEmail } from '../emails/task-created'
import { TaskRescheduledEmail } from '../emails/task-rescheduled'
import { WelcomeEmail } from '../emails/welcome'
import { WorkOrderAssignedTeamEmail } from '../emails/work-order-assigned-team'
import { WorkOrderCreatedEmail } from '../emails/work-order-created'
import { WorkOrderRescheduledEmail } from '../emails/work-order-rescheduled'

const APP_NAME =
  (typeof globalThis !== 'undefined' &&
    (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env
      ?.APP_NAME) ??
  'Kelly'

/** Kelly: business onboarding, auth, and client-facing (booking confirmation, work order created, etc.) */
export type EmailTemplate =
  | 'add-business'
  | 'add-team-member'
  | 'welcome'
  | 'email-verification'
  | 'booking-confirmation'
  | 'quote-created'
  | 'invoice-created-client'
  | 'invoice-assigned-team'
  | 'quote-rejected-by-client'
  | 'work-order-created'
  | 'work-order-assigned-team'
  | 'work-order-rescheduled'
  | 'task-created'
  | 'task-assigned-team'
  | 'task-rescheduled'
  | 'settings-updated'

export const emailSubjects: Record<EmailTemplate, string> = {
  'add-business': `${APP_NAME} - Your Business Portal Login`,
  'add-team-member': `${APP_NAME} - Your team member login for the portal`,
  welcome: `Welcome to ${APP_NAME}!`,
  'email-verification': 'Verify your email address',
  'booking-confirmation': 'Booking Confirmation',
  'quote-created': 'Your quote is ready',
  'invoice-created-client': 'New invoice',
  'invoice-assigned-team': "You've been assigned to an invoice",
  'quote-rejected-by-client': 'A client rejected your quote',
  'work-order-created': 'New work order created',
  'work-order-assigned-team': "You've been assigned to a work order",
  'work-order-rescheduled': 'Your work order schedule has been rescheduled',
  'task-created': 'New task assigned',
  'task-assigned-team': "You've been assigned to a task",
  'task-rescheduled': 'Your task schedule has been rescheduled',
  'settings-updated': 'Your company settings have been updated',
} as const

export async function renderEmailTemplate(
  template: EmailTemplate,
  // biome-ignore lint/suspicious/noExplicitAny: template payload shapes vary
  data: Record<string, any>
): Promise<string> {
  switch (template) {
    case 'add-business': {
      const { businessOwnerName, businessName, email, password, loginUrl } = data
      return render(
        <AddBusinessEmail
          businessOwnerName={businessOwnerName}
          businessName={businessName}
          email={email}
          password={password}
          loginUrl={loginUrl}
        />
      )
    }
    case 'add-team-member': {
      const {
        memberName,
        businessName,
        roleName,
        email,
        password,
        loginUrl,
        portalLabel,
        description,
        permissions,
      } = data
      return render(
        <AddTeamMemberEmail
          memberName={memberName}
          businessName={businessName}
          roleName={roleName}
          email={email}
          password={password}
          loginUrl={loginUrl}
          portalLabel={portalLabel}
          description={description}
          permissions={Array.isArray(permissions) ? permissions : []}
        />
      )
    }
    case 'welcome': {
      const { userName } = data
      return render(<WelcomeEmail userName={userName} />)
    }
    case 'email-verification': {
      const { verificationLink, userName } = data
      return render(<EmailVerification verificationLink={verificationLink} userName={userName} />)
    }
    case 'booking-confirmation': {
      const {
        clientName,
        serviceTitle,
        date,
        timeRange,
        assignedTeamMemberName,
        businessName,
        logoUrl,
      } = data
      return render(
        <BookingConfirmationEmail
          clientName={clientName}
          serviceTitle={serviceTitle}
          date={date}
          timeRange={timeRange}
          assignedTeamMemberName={assignedTeamMemberName}
          businessName={businessName}
          logoUrl={logoUrl}
        />
      )
    }
    case 'quote-created': {
      const {
        clientName,
        businessName,
        quoteNumber,
        quoteReference,
        title,
        address,
        date,
        timeRange,
        assignedTeamMemberName,
        lineItemsSummary,
        total,
        logoUrl,
        approveUrl,
        rejectUrl,
      } = data
      return render(
        <QuoteCreatedEmail
          clientName={clientName}
          businessName={businessName}
          quoteNumber={quoteNumber}
          quoteReference={quoteReference}
          title={title}
          address={address}
          date={date}
          timeRange={timeRange}
          assignedTeamMemberName={assignedTeamMemberName}
          lineItemsSummary={lineItemsSummary ?? ''}
          total={total}
          logoUrl={logoUrl}
          approveUrl={approveUrl}
          rejectUrl={rejectUrl}
        />
      )
    }
    case 'invoice-created-client': {
      const {
        clientName,
        businessName,
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
        logoUrl,
      } = data
      return render(
        <InvoiceCreatedClientEmail
          clientName={clientName}
          businessName={businessName}
          invoiceNumber={invoiceNumber}
          title={title}
          address={address}
          createdDate={createdDate}
          assignedTeamMemberName={assignedTeamMemberName}
          lineItemsSummary={lineItemsSummary ?? ''}
          subtotal={subtotal}
          tax={tax}
          total={total}
          balance={balance}
          workOrderSummary={workOrderSummary ?? null}
          logoUrl={logoUrl}
        />
      )
    }
    case 'invoice-assigned-team': {
      const {
        assigneeName,
        businessName,
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
        logoUrl,
      } = data
      return render(
        <InvoiceAssignedTeamEmail
          assigneeName={assigneeName}
          businessName={businessName}
          invoiceNumber={invoiceNumber}
          title={title}
          clientName={clientName}
          clientPhone={clientPhone}
          address={address}
          createdDate={createdDate}
          lineItemsSummary={lineItemsSummary ?? ''}
          subtotal={subtotal}
          tax={tax}
          total={total}
          balance={balance}
          workOrderSummary={workOrderSummary ?? null}
          observations={observations}
          logoUrl={logoUrl}
        />
      )
    }
    case 'quote-rejected-by-client': {
      const {
        businessName,
        clientName,
        quoteNumber,
        quoteReference,
        title,
        rejectionReason,
        logoUrl,
        dashboardUrl,
      } = data
      return render(
        <QuoteRejectedByClientEmail
          businessName={businessName}
          clientName={clientName}
          quoteNumber={quoteNumber}
          quoteReference={quoteReference}
          title={title}
          rejectionReason={rejectionReason}
          logoUrl={logoUrl}
          dashboardUrl={dashboardUrl}
        />
      )
    }
    case 'work-order-created': {
      const {
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
        tax,
        instructions,
        logoUrl,
      } = data
      return render(
        <WorkOrderCreatedEmail
          clientName={clientName}
          businessName={businessName}
          workOrderNumber={workOrderNumber}
          title={title}
          address={address}
          date={date}
          timeRange={timeRange}
          assignedTeamMemberName={assignedTeamMemberName}
          lineItemsSummary={lineItemsSummary ?? ''}
          total={total}
          tax={tax}
          instructions={instructions}
          logoUrl={logoUrl}
        />
      )
    }
    case 'work-order-assigned-team': {
      const {
        assigneeName,
        businessName,
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
        logoUrl,
      } = data
      return render(
        <WorkOrderAssignedTeamEmail
          assigneeName={assigneeName}
          businessName={businessName}
          workOrderNumber={workOrderNumber}
          title={title}
          clientName={clientName}
          clientPhone={clientPhone}
          address={address}
          date={date}
          timeRange={timeRange}
          lineItemsSummary={lineItemsSummary ?? ''}
          instructions={instructions}
          total={total}
          logoUrl={logoUrl}
        />
      )
    }
    case 'task-created': {
      const {
        clientName,
        businessName,
        title,
        address,
        date,
        timeRange,
        assignedTeamMemberName,
        instructions,
        logoUrl,
      } = data
      return render(
        <TaskCreatedEmail
          clientName={clientName}
          businessName={businessName}
          title={title}
          address={address}
          date={date}
          timeRange={timeRange}
          assignedTeamMemberName={assignedTeamMemberName}
          instructions={instructions}
          logoUrl={logoUrl}
        />
      )
    }
    case 'task-assigned-team': {
      const {
        assigneeName,
        businessName,
        title,
        clientName,
        clientPhone,
        address,
        date,
        timeRange,
        instructions,
        logoUrl,
      } = data
      return render(
        <TaskAssignedTeamEmail
          assigneeName={assigneeName}
          businessName={businessName}
          title={title}
          clientName={clientName}
          clientPhone={clientPhone}
          address={address}
          date={date}
          timeRange={timeRange}
          instructions={instructions}
          logoUrl={logoUrl}
        />
      )
    }
    case 'work-order-rescheduled': {
      const {
        clientName,
        businessName,
        workOrderNumber,
        title,
        address,
        date,
        timeRange,
        assignedTeamMemberName,
        instructions,
        logoUrl,
      } = data
      return render(
        <WorkOrderRescheduledEmail
          clientName={clientName}
          businessName={businessName}
          workOrderNumber={workOrderNumber}
          title={title}
          address={address}
          date={date}
          timeRange={timeRange}
          assignedTeamMemberName={assignedTeamMemberName}
          instructions={instructions}
          logoUrl={logoUrl}
        />
      )
    }
    case 'task-rescheduled': {
      const {
        clientName,
        businessName,
        title,
        address,
        date,
        timeRange,
        assignedTeamMemberName,
        instructions,
        logoUrl,
      } = data
      return render(
        <TaskRescheduledEmail
          clientName={clientName}
          businessName={businessName}
          title={title}
          address={address}
          date={date}
          timeRange={timeRange}
          assignedTeamMemberName={assignedTeamMemberName}
          instructions={instructions}
          logoUrl={logoUrl}
        />
      )
    }
    case 'settings-updated': {
      const { ownerName, businessName, appName } = data
      return render(
        <SettingsUpdatedEmail
          ownerName={ownerName}
          businessName={businessName}
          appName={appName ?? APP_NAME}
        />
      )
    }
    default:
      throw new Error(`Unknown email template: ${template}`)
  }
}
