/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface BookingConfirmationEmailProps {
  clientName: string
  serviceTitle: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  businessName: string
  /** Company logo URL (Company Settings). Shown in header instead of platform logo. */
  logoUrl?: string | null
}

export const BookingConfirmationEmail = ({
  clientName,
  serviceTitle,
  date,
  timeRange,
  assignedTeamMemberName,
  businessName,
  logoUrl,
}: BookingConfirmationEmailProps) => {
  return (
    <EmailLayout
      preview="Your booking has been confirmed"
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Text style={emailStyles.text}>Dear {clientName},</Text>
        <Text style={emailStyles.text}>
          Your booking has been confirmed for {serviceTitle}.
        </Text>
        <Section style={emailStyles.card}>
          <Text style={emailStyles.cardHeading}>Schedule details</Text>
          <Text style={emailStyles.cardText}>
            Date: {date}
            <br />
            Time: {timeRange}
            <br />
            Assigned team member: {assignedTeamMemberName}
          </Text>
        </Section>
        <Text style={emailStyles.text}>
          If you have any questions or need to reschedule, please contact {businessName} directly.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default BookingConfirmationEmail
