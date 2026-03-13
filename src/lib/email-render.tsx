/** @jsxImportSource react */

import { render } from '@react-email/components'
import { AddBusinessEmail } from '../emails/admin/add.business'
import { AddTeamMemberEmail } from '../emails/admin/add.team-member'
import { ClientProfileUpdateEmail } from '../emails/client-profile-update'
import { EmailVerification } from '../emails/email.verification'
import { WelcomeEmail } from '../emails/welcome'

const APP_NAME = Bun.env.APP_NAME ?? 'Kelly'

/** Kelly: only templates we use for business onboarding & auth */
export type EmailTemplate =
  | 'add-business'
  | 'add-team-member'
  | 'welcome'
  | 'email-verification'
  | 'client-profile-update'

export const emailSubjects: Record<EmailTemplate, string> = {
  'add-business': `${APP_NAME} - Your Business Portal Login`,
  'add-team-member': `${APP_NAME} - Your team member login for the portal`,
  welcome: `Welcome to ${APP_NAME}!`,
  'email-verification': 'Verify your email address',
  'client-profile-update': `${APP_NAME} - Update to your client profile`,
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
      const { memberName, businessName, roleName, email, password, loginUrl, description } = data
      return render(
        <AddTeamMemberEmail
          memberName={memberName}
          businessName={businessName}
          roleName={roleName}
          email={email}
          password={password}
          loginUrl={loginUrl}
          description={description}
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
      const { clientName, businessName, isUpdate } = data
      return render(
        <ClientProfileUpdateEmail
          clientName={clientName}
          businessName={businessName}
          isUpdate={isUpdate}
        />
      )
    }
    default:
      throw new Error(`Unknown email template: ${template}`)
  }
}
