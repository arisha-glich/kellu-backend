/** @jsxImportSource react */

import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type * as React from 'react'

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  maxWidth: '600px',
}

const header = {
  backgroundColor: '#0f172a',
  padding: '24px 40px',
  borderBottom: '3px solid #10B4D4',
  textAlign: 'center' as const,
}

const logo = {
  margin: '0 auto',
}

const headerTextStyle = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  letterSpacing: '0.5px',
  margin: '0',
}

const footerSection = {
  backgroundColor: '#f9fafb',
  borderTop: '1px solid #e5e7eb',
  padding: '32px 40px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '8px 0',
}

const footerLink = {
  color: '#10B4D4',
  textDecoration: 'underline',
}

const copyright = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '24px 0 0',
}

interface EmailLayoutProps {
  children: React.ReactNode
  preview?: string
  /** Company logo URL (from Company Settings). When set, used in header instead of platform logo. */
  logoUrl?: string | null
  /** When no logo: show this as header text (e.g. business name for client→customer emails). */
  headerTitle?: string
}

export function EmailLayout({ children, preview, logoUrl, headerTitle }: EmailLayoutProps) {
  const appName = process.env.APP_NAME ?? 'Kelly'
  const defaultLogoUrl = process.env.EMAIL_LOGO_URL ?? ''
  const baseUrl =
    process.env.BETTER_AUTH_URL ||
    process.env.BASE_URL ||
    process.env.FRONTEND_URL ||
    'http://kellu.co'

  const effectiveLogoUrl = logoUrl?.trim() || defaultLogoUrl
  const showLogo = !!effectiveLogoUrl
  const headerLabel = headerTitle?.trim() || appName

  return (
    <Html>
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body style={main}>
        <Container style={container}>
          {/* Header: company logo when provided, else platform logo, else header text (e.g. business name) */}
          <Section style={header}>
            {showLogo ? (
              <Img
                src={effectiveLogoUrl}
                alt={headerLabel}
                width="150"
                height="40"
                style={logo}
              />
            ) : (
              <Text style={headerTextStyle}>{headerLabel}</Text>
            )}
          </Section>

          {/* Main Content */}
          {children}

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerText}>
              <strong>Need help?</strong> Reply to this email or contact us at{' '}
              <Link href="mailto:equipo@kellu.co" style={footerLink}>
                equipo@kellu.co
              </Link>
            </Text>
            <Text style={footerText}>
              <Link href={baseUrl} style={footerLink}>
                Go to {appName}
              </Link>
              {' · '}
              <Link href={`${baseUrl}/settings`} style={footerLink}>
                Settings
              </Link>
              {' · '}
              <Link href={`${baseUrl}/privacy`} style={footerLink}>
                Privacy
              </Link>
              {' · '}
              <Link href={`${baseUrl}/terms`} style={footerLink}>
                Terms
              </Link>
            </Text>
            <Text style={footerText}>
              Best regards,
              <br />
              The {appName} Team
            </Text>
            <Text style={copyright}>
              © {new Date().getFullYear()} {appName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const emailStyles = {
  content: {
    padding: '40px',
  },
  h1: {
    color: '#000000',
    fontSize: '28px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    margin: '0 0 24px',
  },
  h2: {
    color: '#000000',
    fontSize: '22px',
    fontWeight: 'bold',
    textAlign: 'left' as const,
    margin: '0 0 16px',
  },
  text: {
    color: '#374151',
    fontSize: '16px',
    lineHeight: '24px',
    textAlign: 'left' as const,
    margin: '0 0 16px',
  },
  card: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '32px',
    margin: '24px 0',
    textAlign: 'center' as const,
  },
  cardHeading: {
    color: '#000000',
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0 0 16px',
  },
  cardText: {
    color: '#6b7280',
    fontSize: '14px',
    lineHeight: '20px',
    margin: '0 0 24px',
  },
  buttonContainer: {
    textAlign: 'center' as const,
    margin: '32px 0',
  },
  button: {
    backgroundColor: '#10B4D4',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '14px 32px',
  },
}
