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
  /** Permissions for the role (e.g. [{ resource: 'workorders', action: 'read' }]). */
  permissions?: Array<{ resource: string; action: string }>
}

const credentialBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '20px 0',
}

const permissionsBox = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '16px 0',
}

const permissionItem = {
  color: '#166534',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '4px 0',
}

export const AddTeamMemberEmail = ({
  memberName,
  businessName,
  roleName,
  email,
  password,
  loginUrl,
  description,
  permissions = [],
}: AddTeamMemberEmailProps) => {
  const hasPermissions = permissions && permissions.length > 0

  return (
    <EmailLayout preview={`You've been added to ${businessName} as ${roleName}`}>
      <Section style={emailStyles.content}>
        <Heading style={emailStyles.h1}>You're on the team</Heading>
        <Text style={emailStyles.text}>Hi {memberName},</Text>
        <Text style={emailStyles.text}>
          You've been added to <strong>{businessName}</strong> with the role{' '}
          <strong>{roleName}</strong>.
          {description ? (
            <>
              <br />
              <br />
              {description}
            </>
          ) : null}
        </Text>

        {hasPermissions ? (
          <Section style={permissionsBox}>
            <Text style={{ ...emailStyles.cardHeading, marginBottom: '12px', fontSize: '16px' }}>
              Your permissions
            </Text>
            {permissions.map(p => (
              <Text key={`${p.resource}:${p.action}`} style={permissionItem}>
                • {p.resource}: {p.action}
              </Text>
            ))}
          </Section>
        ) : null}

        <Text style={{ ...emailStyles.text, marginTop: '16px' }}>
          Use the credentials below to log in to the business dashboard:
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
            Log in to the business dashboard
          </Button>
        </Section>

        <Text
          style={{ ...emailStyles.text, marginTop: '16px', color: '#64748b', fontSize: '14px' }}
        >
          After logging in you will be taken to the dashboard. You can update your password in
          settings. If you have questions, contact your business admin or reply to this email.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default AddTeamMemberEmail
