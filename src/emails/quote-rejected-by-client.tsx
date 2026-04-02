/** @jsxImportSource react */

import { Button, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface QuoteRejectedByClientEmailProps {
  businessName: string
  clientName: string
  quoteNumber: string
  quoteReference?: string
  title: string
  rejectionReason: string
  logoUrl?: string | null
  dashboardUrl: string
}

const reasonBox = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '16px 0',
}

export const QuoteRejectedByClientEmail = ({
  businessName,
  clientName,
  quoteNumber,
  quoteReference,
  title,
  rejectionReason,
  logoUrl,
  dashboardUrl,
}: QuoteRejectedByClientEmailProps) => {
  return (
    <EmailLayout
      preview={`${clientName} rejected quote ${quoteNumber}`}
      logoUrl={logoUrl}
      headerTitle={businessName}
    >
      <Section style={emailStyles.content}>
        <Text style={emailStyles.h1}>Quote rejected by client</Text>
        <Text style={emailStyles.text}>
          <strong>{clientName}</strong> has rejected the following quote and left a reason.
        </Text>

        <Section
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '20px 24px',
            margin: '16px 0',
          }}
        >
          <Text style={{ ...emailStyles.cardHeading, marginBottom: '8px' }}>
            {quoteNumber} — {title}
          </Text>
          {quoteReference ? (
            <Text style={{ ...emailStyles.text, margin: '4px 0' }}>
              <strong>Reference:</strong> {quoteReference}
            </Text>
          ) : null}
        </Section>

        <Text style={{ ...emailStyles.text, marginTop: '8px', marginBottom: '4px' }}>
          <strong>Client&apos;s reason</strong>
        </Text>
        <Section style={reasonBox}>
          <Text style={{ ...emailStyles.text, margin: '0', whiteSpace: 'pre-wrap' as const }}>
            {rejectionReason}
          </Text>
        </Section>

        <Section style={{ marginTop: '24px' }}>
          <Button
            href={dashboardUrl}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Open dashboard
          </Button>
        </Section>

        <Text style={{ ...emailStyles.cardText, marginTop: '24px', textAlign: 'left' as const }}>
          You can follow up with the client or adjust the quote in Kellu.
        </Text>
      </Section>
    </EmailLayout>
  )
}
