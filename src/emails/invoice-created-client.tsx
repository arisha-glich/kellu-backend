/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface InvoiceCreatedClientEmailProps {
  clientName: string
  businessName: string
  invoiceNumber: string
  title: string
  address: string
  /** Human-readable created date */
  createdDate: string
  assignedTeamMemberName: string
  lineItemsSummary: string
  subtotal?: string
  tax?: string
  total?: string
  balance?: string
  workOrderSummary?: string | null
  logoUrl?: string | null
}

const detailBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '16px 0',
}

export const InvoiceCreatedClientEmail = ({
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
}: InvoiceCreatedClientEmailProps) => {
  return (
    <EmailLayout
      preview={`Invoice ${invoiceNumber} – ${title}`}
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>New invoice</Text>
        <Text style={emailStyles.text}>Dear {clientName},</Text>
        <Text style={emailStyles.text}>
          <strong>{businessName}</strong> has created an invoice for you. Details are below.
        </Text>

        <Section style={detailBox}>
          <Text style={{ ...emailStyles.cardHeading, marginBottom: '12px' }}>
            {invoiceNumber} – {title}
          </Text>
          {workOrderSummary?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Related job:</strong> {workOrderSummary.trim()}
            </Text>
          ) : null}
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Service / billing address:</strong> {address}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Invoice date:</strong> {createdDate}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Your contact at {businessName}:</strong> {assignedTeamMemberName}
          </Text>
          {lineItemsSummary.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '12px 0 8px' }}>
              <strong>Line items:</strong>
              <br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{lineItemsSummary.trim()}</span>
            </Text>
          ) : null}
          {subtotal ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Subtotal:</strong> {subtotal}
            </Text>
          ) : null}
          {tax ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Tax:</strong> {tax}
            </Text>
          ) : null}
          {total ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Total:</strong> {total}
            </Text>
          ) : null}
          {balance != null && balance !== '' ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Balance due:</strong> {balance}
            </Text>
          ) : null}
        </Section>

        <Text style={emailStyles.text}>
          If you have questions about this invoice, reply to this email or contact {businessName}{' '}
          directly.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default InvoiceCreatedClientEmail
