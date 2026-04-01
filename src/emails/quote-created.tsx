/** @jsxImportSource react */

import { Button, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface QuoteCreatedEmailProps {
  clientName: string
  businessName: string
  quoteNumber: string
  quoteReference?: string
  title: string
  address: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  lineItemsSummary: string
  total?: string
  logoUrl?: string | null
  approveUrl: string
  rejectUrl: string
}

const detailBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '16px 0',
}

export const QuoteCreatedEmail = ({
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
}: QuoteCreatedEmailProps) => {
  return (
    <EmailLayout
      preview={`Your quote ${quoteNumber} is ready`}
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>Your quote is ready</Text>
        <Text style={emailStyles.text}>Dear {clientName},</Text>
        <Text style={emailStyles.text}>
          <strong>{businessName}</strong> has prepared your quote. Please review the details below.
        </Text>

        <Section style={detailBox}>
          <Text style={{ ...emailStyles.cardHeading, marginBottom: '12px' }}>
            {quoteNumber} - {title}
          </Text>
          {quoteReference ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Reference:</strong> {quoteReference}
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
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Assigned team member:</strong> {assignedTeamMemberName}
          </Text>
          {lineItemsSummary ? (
            <Text style={{ ...emailStyles.text, margin: '12px 0 8px' }}>
              <strong>Items:</strong>
              <br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{lineItemsSummary}</span>
            </Text>
          ) : null}
          {total ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0 0' }}>
              <strong>Total estimate:</strong> {total}
            </Text>
          ) : null}
        </Section>

        <Text style={emailStyles.text}>
          If you have any questions or would like changes before approval, please reply to this
          email.
        </Text>
        <Section style={{ textAlign: 'center', marginTop: '24px' }}>
          <Button
            href={approveUrl}
            style={{
              backgroundColor: '#10b981',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '12px 24px',
              textDecoration: 'none',
              fontWeight: 'bold',
              marginRight: '12px',
            }}
          >
            Approve Quote
          </Button>
          <Button
            href={rejectUrl}
            style={{
              backgroundColor: '#ef4444',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '12px 24px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Reject Quote
          </Button>
        </Section>
      </Section>
    </EmailLayout>
  )
}

export default QuoteCreatedEmail
