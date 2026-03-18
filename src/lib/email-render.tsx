/** @jsxImportSource react */

import { render } from '@react-email/components'
import { AddBusinessEmail } from '../emails/admin/add.business'
import { AddTeamMemberEmail } from '../emails/admin/add.team-member'
import { BookingConfirmationEmail } from '../emails/booking-confirmation'
import { ClientProfileUpdateEmail } from '../emails/client-profile-update'
import { EmailVerification } from '../emails/email.verification'
import { WelcomeEmail } from '../emails/welcome'
import { WorkOrderCreatedEmail } from '../emails/work-order-created'
import { TaskCreatedEmail } from '../emails/task-created'
import { SettingsUpdatedEmail } from '../emails/settings-updated'

const APP_NAME =
  (typeof globalThis !== 'undefined' &&
    (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.APP_NAME) ??
  'Kelly'

/** Kelly: business onboarding, auth, and client-facing (booking confirmation, work order created, etc.) */
export type EmailTemplate =
  | 'add-business'
  | 'add-team-member'
  | 'welcome'
  | 'email-verification'
  | 'client-profile-update'
  | 'booking-confirmation'
  | 'work-order-created'
  | 'task-created'
  | 'settings-updated'

export const emailSubjects: Record<EmailTemplate, string> = {
  'add-business': `${APP_NAME} - Your Business Portal Login`,
  'add-team-member': `${APP_NAME} - Your team member login for the portal`,
  welcome: `Welcome to ${APP_NAME}!`,
  'email-verification': 'Verify your email address',
  'client-profile-update': `${APP_NAME} - Update to your client profile`,
  'booking-confirmation': 'Booking Confirmation',
  'work-order-created': 'New work order created',
  'task-created': 'New task assigned',
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
      const { memberName, businessName, roleName, email, password, loginUrl, description, permissions } = data
      return render(
        <AddTeamMemberEmail
          memberName={memberName}
          businessName={businessName}
          roleName={roleName}
          email={email}
          password={password}
          loginUrl={loginUrl}
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
    case 'client-profile-update': {
      const { clientName, businessName, isUpdate, logoUrl } = data
      return render(
        <ClientProfileUpdateEmail
          clientName={clientName}
          businessName={businessName}
          isUpdate={isUpdate}
          logoUrl={logoUrl}
        />
      )
    }
    case 'booking-confirmation': {
      const { clientName, serviceTitle, date, timeRange, assignedTeamMemberName, businessName, logoUrl } = data
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
