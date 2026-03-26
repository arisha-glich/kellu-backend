/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface TaskCreatedEmailProps {
  clientName: string
  businessName: string
  title: string
  address: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  instructions?: string
  /** Company logo URL (Company Settings). Shown in header instead of platform logo. */
  logoUrl?: string | null
}

const detailBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '16px 0',
}

export const TaskCreatedEmail = ({
  clientName,
  businessName,
  title,
  address,
  date,
  timeRange,
  assignedTeamMemberName,
  instructions,
  logoUrl,
}: TaskCreatedEmailProps) => {
  return (
    <EmailLayout preview={`New task: ${title}`} logoUrl={logoUrl} headerTitle={businessName}>
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>New task assigned</Text>
        <Text style={emailStyles.text}>Dear {clientName},</Text>
        <Text style={emailStyles.text}>
          <strong>{businessName}</strong> has created a new task for you. Here are the details:
        </Text>

        <Section style={detailBox}>
          <Text style={{ ...emailStyles.cardHeading, marginBottom: '12px' }}>{title}</Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Address:</strong> {address}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Date:</strong> {date}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Time:</strong> {timeRange}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Assigned to:</strong> {assignedTeamMemberName}
          </Text>
          {instructions ? (
            <Text style={{ ...emailStyles.text, margin: '12px 0 0' }}>
              <strong>Instructions:</strong>
              <br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{instructions}</span>
            </Text>
          ) : null}
        </Section>

        <Text style={emailStyles.text}>
          If you have any questions, please contact {businessName} directly.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default TaskCreatedEmail
