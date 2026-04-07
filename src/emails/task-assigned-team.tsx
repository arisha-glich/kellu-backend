/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface TaskAssignedTeamEmailProps {
  assigneeName: string
  businessName: string
  title: string
  clientName: string
  clientPhone?: string | null
  address: string
  date: string
  timeRange: string
  instructions?: string | null
  logoUrl?: string | null
}

const detailBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '16px 0',
}

export const TaskAssignedTeamEmail = ({
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
}: TaskAssignedTeamEmailProps) => {
  return (
    <EmailLayout
      preview={`Assigned: ${title} (${clientName})`}
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>You&apos;ve been assigned to a task</Text>
        <Text style={emailStyles.text}>Hi {assigneeName},</Text>
        <Text style={emailStyles.text}>
          You have been assigned to the following task for <strong>{businessName}</strong>:
        </Text>

        <Section style={detailBox}>
          <Text style={{ ...emailStyles.cardHeading, marginBottom: '12px' }}>{title}</Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Client:</strong> {clientName}
          </Text>
          {clientPhone?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Client phone:</strong> {clientPhone.trim()}
            </Text>
          ) : null}
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Address:</strong> {address}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Date:</strong> {date}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Time:</strong> {timeRange}
          </Text>
          {instructions?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Instructions:</strong>
              <br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{instructions.trim()}</span>
            </Text>
          ) : null}
        </Section>

        <Text style={emailStyles.text}>Open your dashboard for full details and updates.</Text>
      </Section>
    </EmailLayout>
  )
}

export default TaskAssignedTeamEmail
