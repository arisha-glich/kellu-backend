/** @jsxImportSource react */

import { Button, Heading, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from '../components/email-layout'

interface AddBusinessEmailProps {
  businessOwnerName: string
  businessName: string
  email: string
  password: string
  loginUrl: string
}

const credentialBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '20px 0',
}

const _featureList = {
  margin: '8px 0',
  paddingLeft: '20px',
  color: '#374151',
  fontSize: '15px',
  lineHeight: '22px',
}

const _featureTitle = {
  color: '#0f172a',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '20px 0 8px',
}

export const AddBusinessEmail = ({
  businessOwnerName,
  businessName,
  email,
  password,
  loginUrl,
}: AddBusinessEmailProps) => {
  return (
    <EmailLayout preview={`Your ${businessName} account has been created on Kellu`}>
      <Section style={emailStyles.content}>
        <Heading style={emailStyles.h1}>Welcome to Kellu</Heading>
        <Text style={emailStyles.text}>Hi {businessOwnerName},</Text>
        <Text style={emailStyles.text}>
          Your business account for <strong>{businessName}</strong> has been created. Use the
          credentials below to log in to your Business Owner Panel.
        </Text>

        <Section style={credentialBox}>
          <Text style={{ ...emailStyles.text, margin: '0 0 8px' }}>
            <strong>Email:</strong> {email}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '0' }}>
            <strong>Temporary password:</strong> {password}
          </Text>
        </Section>

        <Section style={emailStyles.buttonContainer}>
          <Button href={loginUrl} style={emailStyles.button}>
            Log in to your portal
          </Button>
        </Section>

        <Text style={{ ...emailStyles.text, marginTop: '8px' }}>
          After logging in, you can manage your operations from the dashboard: Home, Schedule,
          Clients, Work orders, Quotes, Invoices, Tasks, and Expenses. Settings are in the top
          right.
        </Text>
        <Text style={{ ...emailStyles.text, marginTop: '24px' }}>
          If you have any questions, reply to this email or contact us at{' '}
          <strong>equipo@kellu.co</strong>. We're here to help.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default AddBusinessEmail
