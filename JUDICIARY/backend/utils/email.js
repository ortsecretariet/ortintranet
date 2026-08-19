const nodemailer = require('nodemailer');

// Build transporter — supports Gmail (SMTP_HOST=smtp.gmail.com) or any SMTP server
function createTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS   // Gmail App Password (16-char, no spaces)
    }
  });
}

const transporter = createTransporter();

// Wrap plain text in a clean HTML email template
function buildHtml(subject, text) {
  const lines = text.split('\n').map(l => `<p style="margin:6px 0;color:#333;">${l || '&nbsp;'}</p>`).join('');
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1E6B44;padding:20px 30px;">
            <p style="margin:0;color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;">The Judiciary of Kenya</p>
            <h2 style="margin:4px 0 0;color:#fff;font-size:18px;">Tribunals Notice Board</h2>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 30px;">
            <h3 style="margin:0 0 16px;color:#1E6B44;font-size:16px;">${subject}</h3>
            ${lines}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:14px 30px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:11px;color:#999;">This is an automated message from the Tribunals Internal Notice Board. Do not reply to this email.</p>
            <p style="margin:4px 0 0;font-size:11px;color:#999;">Office of the Registrar, Tribunals &mdash; Judiciary of Kenya</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function sendEmail(to, subject, text, html) {
  if (!to) return;

  const mailOptions = {
    from:    process.env.SMTP_FROM || `"Tribunals Notice Board" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html:    html || buildHtml(subject, text)
  };

  if (transporter) {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error(`Email failed to ${to}:`, err.message);
      else     console.log(`Email sent to ${to}: ${info.messageId}`);
    });
    return;
  }

  // No SMTP configured — log to console (dev mode)
  console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
  console.log(`[EMAIL] ${text}`);
}

module.exports = { sendEmail };
