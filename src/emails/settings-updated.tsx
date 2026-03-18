/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface SettingsUpdatedEmailProps {
  ownerName: string
  businessName: string
  appName: string
}

export const SettingsUpdatedEmail = ({
  ownerName,
  businessName,
  appName,
}: SettingsUpdatedEmailProps) => {
  return (
    <EmailLayout preview="Your company settings have been updated">
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>Settings updated</Text>
        <Text style={emailStyles.text}>Hi {ownerName},</Text>
        <Text style={emailStyles.text}>
          Your company settings for <strong>{businessName}</strong> have been updated successfully
          in your {appName} account.
        </Text>
        <Text style={emailStyles.text}>
          If you did not make this change, please contact support or update your password
          immediately.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default SettingsUpdatedEmail
