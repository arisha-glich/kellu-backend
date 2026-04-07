/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface InvoiceAssignedTeamEmailProps {
  assigneeName: string
  businessName: string
  invoiceNumber: string
  title: string
  clientName: string
  clientPhone?: string | null
  address: string
  createdDate: string
  lineItemsSummary: string
  subtotal?: string
  tax?: string
  total?: string
  balance?: string
  workOrderSummary?: string | null
  observations?: string | null
  logoUrl?: string | null
}

const detailBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '16px 0',
}

export const InvoiceAssignedTeamEmail = ({
  assigneeName,
  businessName,
  invoiceNumber,
  title,
  clientName,
  clientPhone,
  address,
  createdDate,
  lineItemsSummary,
  subtotal,
  tax,
  total,
  balance,
  workOrderSummary,
  observations,
  logoUrl,
}: InvoiceAssignedTeamEmailProps) => {
  return (
    <EmailLayout
      preview={`Invoice ${invoiceNumber} – ${title} (${clientName})`}
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>You&apos;ve been assigned to an invoice</Text>
        <Text style={emailStyles.text}>Hi {assigneeName},</Text>
        <Text style={emailStyles.text}>
          You are listed as the assigned team member on the following invoice for{' '}
          <strong>{businessName}</strong>:
        </Text>

        <Section style={detailBox}>
          <Text style={{ ...emailStyles.cardHeading, marginBottom: '12px' }}>
            {invoiceNumber} – {title}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Client:</strong> {clientName}
          </Text>
          {clientPhone?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Client phone:</strong> {clientPhone.trim()}
            </Text>
          ) : null}
          {workOrderSummary?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Related job:</strong> {workOrderSummary.trim()}
            </Text>
          ) : null}
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Address:</strong> {address}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
            <strong>Invoice date:</strong> {createdDate}
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
          {observations?.trim() ? (
            <Text style={{ ...emailStyles.text, margin: '8px 0' }}>
              <strong>Notes:</strong>
              <br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{observations.trim()}</span>
            </Text>
          ) : null}
        </Section>

        <Text style={emailStyles.text}>
          Open your dashboard for full invoice details and updates.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default InvoiceAssignedTeamEmail
