/** @jsxImportSource react */

import { Heading, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

interface ClientProfileUpdateEmailProps {
  clientName: string
  businessName: string
  isUpdate: boolean
  /** Company logo URL (Company Settings). Shown in header instead of platform logo. */
  logoUrl?: string | null
}

export const ClientProfileUpdateEmail = ({
  clientName,
  businessName,
  isUpdate,
  logoUrl,
}: ClientProfileUpdateEmailProps) => {
  const appName = process.env.APP_NAME ?? 'Kelly'

  const title = isUpdate
    ? 'Your profile has been updated'
    : "You've been added as a client"

  const message = isUpdate
    ? `${businessName} has updated your client profile in their ${appName} account. If you have any questions, please contact them directly.`
    : `${businessName} has added you as a client in their ${appName} account. You may receive service confirmations, quotes, invoices, appointment reminders, and other updates from them.`

  return (
    <EmailLayout
      preview={isUpdate ? 'Your client profile was updated' : 'You were added as a client'}
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Heading style={emailStyles.h1}>{title}</Heading>
        <Text style={emailStyles.text}>Hi {clientName},</Text>
        <Text style={emailStyles.text}>{message}</Text>
        <Text style={emailStyles.text}>
          If you did not expect this, or have any concerns, please reach out to {businessName}
          directly (replies to their messages will go to their company email).
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default ClientProfileUpdateEmail
