/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface WorkOrderAssignedTeamEmailProps {
  /** Assigned team member display name */
  assigneeName: string
  businessName: string
  workOrderNumber: string
  title: string
  clientName: string
  /** Client phone for field context (optional) */
  clientPhone?: string | null
  address: string
  date: string
  timeRange: string
  lineItemsSummary?: string
  instructions?: string | null
  total?: string
  logoUrl?: string | null
}

const detailBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '16px 0',
}

export const WorkOrderAssignedTeamEmail = ({
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
}: WorkOrderAssignedTeamEmailProps) => {
  return (
    <EmailLayout
      preview={`Assigned: ${workOrderNumber} — ${title} (${clientName})`}
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>You&apos;ve been assigned to a work order</Text>
        <Text style={emailStyles.text}>Hi {assigneeName},</Text>
        <Text style={emailStyles.text}>
          You have been assigned to the following job for <strong>{businessName}</strong>:
        </Text>

        <Section style={detailBox}>
          <Text style={{ ...emailStyles.cardHeading, marginBottom: '12px' }}>
            {workOrderNumber} — {title}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Client:</strong> {clientName}
          </Text>
          {clientPhone?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Client phone:</strong> {clientPhone.trim()}
            </Text>
          ) : null}
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Service address:</strong> {address}
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
          {lineItemsSummary?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '12px 0 8px' }}>
              <strong>Items:</strong>
              <br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{lineItemsSummary.trim()}</span>
            </Text>
          ) : null}
          {total ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0 0' }}>
              <strong>Total:</strong> {total}
            </Text>
          ) : null}
        </Section>

        <Text style={emailStyles.text}>Open your dashboard for full details and updates.</Text>
      </Section>
    </EmailLayout>
  )
}

export default WorkOrderAssignedTeamEmail
