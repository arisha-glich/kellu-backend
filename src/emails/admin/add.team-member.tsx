/** @jsxImportSource react */

import { Button, Heading, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from '../components/email-layout'

export interface AddTeamMemberEmailProps {
  memberName: string
  businessName: string
  roleName: string
  email: string
  password: string
  loginUrl: string
  description?: string
}

const credentialBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '20px 0',
}

export const AddTeamMemberEmail = ({
  memberName,
  businessName,
  roleName,
  email,
  password,
  loginUrl,
  description,
}: AddTeamMemberEmailProps) => {
  return (
    <EmailLayout preview={`You've been added to ${businessName} as ${roleName}`}>
      <Section style={emailStyles.content}>
        <Heading style={emailStyles.h1}>You're on the team</Heading>
        <Text style={emailStyles.text}>Hi {memberName},</Text>
        <Text style={emailStyles.text}>
          You've been added to <strong>{businessName}</strong> with the role <strong>{roleName}</strong>.
          {description ? (
            <>
              <br />
              <br />
              {description}
            </>
          ) : null}
        </Text>

        <Text style={{ ...emailStyles.text, marginTop: '16px' }}>
          Use the credentials below to log in to the portal:
        </Text>

        <Section style={credentialBox}>
          <Text style={{ ...emailStyles.text, margin: '0 0 8px' }}>
            <strong>Email:</strong> {email}
          </Text>
          <Text style={{ ...emailStyles.text, margin: '0' }}>
            <strong>Password:</strong> {password}
          </Text>
        </Section>

        <Section style={emailStyles.buttonContainer}>
          <Button href={loginUrl} style={emailStyles.button}>
            Log in to the portal
          </Button>
        </Section>

        <Text style={{ ...emailStyles.text, marginTop: '16px', color: '#64748b', fontSize: '14px' }}>
          You can update your password after logging in. If you have questions, contact your business
          admin or reply to this email.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default AddTeamMemberEmail
