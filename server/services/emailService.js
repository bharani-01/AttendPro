const nodemailer = require('nodemailer');
const AppSetting = require('../models/AppSetting');

const EMAIL_TEMPLATE_SETTING_KEY = 'emailTemplateOverrides';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || process.env.BREVO_SMTP_KEY || 'your-brevo-smtp-key'
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function baseTemplate({ title, previewText, bodyHtml }) {
  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText || title)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:20px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <tr>
                  <td style="background:#0f172a;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700;">Attendance Management System</td>
                </tr>
                <tr>
                  <td style="padding:24px;line-height:1.6;font-size:14px;">${bodyHtml}</td>
                </tr>
                <tr>
                  <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">This is an automated message. Please do not reply directly to this email.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

const templateBuilders = {
  attendance_alert(vars = {}) {
    const studentName = escapeHtml(vars.studentName);
    const subjectName = escapeHtml(vars.subjectName);
    const className = escapeHtml(vars.className);
    const status = escapeHtml(String(vars.status || '').toUpperCase());
    const date = escapeHtml(formatDate(vars.date));

    return {
      html: baseTemplate({
        title: `Attendance Alert: ${status} - ${subjectName}`,
        previewText: `Attendance status is ${status} for ${studentName}`,
        bodyHtml: `
          <h2 style="margin-top:0;color:#111827;">Attendance Notification</h2>
          <p>Dear Parent/Guardian,</p>
          <p>Your ward <strong>${studentName}</strong> was marked <strong>${status}</strong>.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:12px 0;">
            <tr><td style="padding:8px;border:1px solid #e5e7eb;width:120px;"><strong>Subject</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${subjectName}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;"><strong>Class</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${className}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;"><strong>Date</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${date}</td></tr>
          </table>
          <p>Please contact the faculty if you have any concerns.</p>
        `
      }),
      subject: vars.subject || `Attendance Alert: ${status} - ${subjectName}`
    };
  },

  leave_status_update(vars = {}) {
    const studentName = escapeHtml(vars.studentName);
    const status = String(vars.status || '').toLowerCase();
    const statusText = escapeHtml(status.toUpperCase());
    const statusColor = status === 'approved' ? '#15803d' : '#b91c1c';
    const date = escapeHtml(formatDate(vars.date));
    const reason = escapeHtml(vars.reason);
    const comment = vars.reviewComment ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;"><strong>Comment</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(vars.reviewComment)}</td></tr>` : '';

    return {
      html: baseTemplate({
        title: `Leave Request ${statusText}`,
        previewText: `Leave request is ${statusText}`,
        bodyHtml: `
          <h2 style="margin-top:0;color:#111827;">Leave Request Update</h2>
          <p>Dear ${studentName},</p>
          <p>Your leave request has been <strong style="color:${statusColor};">${statusText}</strong>.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:12px 0;">
            <tr><td style="padding:8px;border:1px solid #e5e7eb;width:120px;"><strong>Date</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${date}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;"><strong>Reason</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${reason}</td></tr>
            ${comment}
          </table>
        `
      }),
      subject: vars.subject || `Leave Request ${statusText}`
    };
  },

  password_reset(vars = {}) {
    const resetLink = escapeHtml(vars.resetLink);
    return {
      html: baseTemplate({
        title: 'Password Reset Request',
        previewText: 'Password reset link generated',
        bodyHtml: `
          <h2 style="margin-top:0;color:#111827;">Password Reset Request</h2>
          <p>You requested to reset your account password.</p>
          <p>Please click the link below to continue:</p>
          <p><a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:6px;">Reset Password</a></p>
          <p>Or use this URL: <a href="${resetLink}">${resetLink}</a></p>
          <p>This link is valid for one hour.</p>
        `
      }),
      subject: vars.subject || 'Password Reset Request'
    };
  },

  admin_password_reset(vars = {}) {
    const tempPassword = escapeHtml(vars.tempPassword);
    return {
      html: baseTemplate({
        title: 'Your Password Has Been Reset by Admin',
        previewText: 'Temporary password generated by admin',
        bodyHtml: `
          <h2 style="margin-top:0;color:#111827;">Password Reset by Administrator</h2>
          <p>Your account password was reset by an administrator.</p>
          <p><strong>Temporary Password:</strong> <span style="font-family:monospace;">${tempPassword}</span></p>
          <p>Please login and change your password immediately.</p>
        `
      }),
      subject: vars.subject || 'Your Password Has Been Reset by Admin'
    };
  },

  generic_notification(vars = {}) {
    const heading = escapeHtml(vars.heading || 'Notification');
    const message = escapeHtml(vars.message || 'No message provided');
    const ctaText = vars.ctaText ? escapeHtml(vars.ctaText) : '';
    const ctaUrl = vars.ctaUrl ? escapeHtml(vars.ctaUrl) : '';

    const ctaHtml = ctaText && ctaUrl
      ? `<p><a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:6px;">${ctaText}</a></p>`
      : '';

    return {
      html: baseTemplate({
        title: vars.subject || heading,
        previewText: heading,
        bodyHtml: `
          <h2 style="margin-top:0;color:#111827;">${heading}</h2>
          <p>${message}</p>
          ${ctaHtml}
        `
      }),
      subject: vars.subject || heading
    };
  }
};

const TEMPLATE_VARIABLE_KEYS = {
  attendance_alert: ['studentName', 'subjectName', 'className', 'status', 'date'],
  leave_status_update: ['studentName', 'status', 'date', 'reason', 'reviewComment'],
  password_reset: ['resetLink'],
  admin_password_reset: ['tempPassword'],
  generic_notification: ['heading', 'message', 'ctaText', 'ctaUrl'],
};

const TEMPLATE_SAMPLE_VARIABLES = {
  attendance_alert: {
    studentName: 'John Doe',
    subjectName: 'Computer Networks',
    className: 'CSE-A',
    status: 'absent',
    date: new Date(),
  },
  leave_status_update: {
    studentName: 'John Doe',
    status: 'approved',
    date: new Date(),
    reason: 'Medical leave',
    reviewComment: 'Get well soon.',
  },
  password_reset: {
    resetLink: 'https://example.com/reset?token=abc123',
  },
  admin_password_reset: {
    tempPassword: 'Temp#1234',
  },
  generic_notification: {
    heading: 'Important Update',
    message: 'Please review your dashboard.',
    ctaText: 'Open Dashboard',
    ctaUrl: 'https://example.com/dashboard',
  },
};

function normalizeTemplateOverrides(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  const normalized = {};

  Object.keys(templateBuilders).forEach((templateKey) => {
    const item = incoming[templateKey] && typeof incoming[templateKey] === 'object'
      ? incoming[templateKey]
      : {};

    normalized[templateKey] = {
      enabled: typeof item.enabled === 'boolean' ? item.enabled : false,
      subject: String(item.subject || '').trim(),
      bodyHtml: String(item.bodyHtml || '').trim(),
    };
  });

  return normalized;
}

function renderTemplateString(template, variables = {}) {
  const source = String(template || '');
  return source.replace(/{{\s*([\w.]+)\s*}}/g, (_match, rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return '';

    const value = key.split('.').reduce((acc, part) => {
      if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
        return acc[part];
      }
      return undefined;
    }, variables);

    return value === undefined || value === null ? '' : String(value);
  });
}

async function getTemplateOverrides() {
  const setting = await AppSetting.findOne({ key: EMAIL_TEMPLATE_SETTING_KEY }).select('value');
  return normalizeTemplateOverrides(setting?.value);
}

function buildTemplateEmail(templateKey, vars = {}) {
  const builder = templateBuilders[templateKey];
  if (!builder) {
    throw new Error(`Unknown email template: ${templateKey}`);
  }
  return builder(vars);
}

async function resolveTemplateEmail({ templateKey, variables = {}, subject = '', templateOverride = null }) {
  const defaultBuilt = buildTemplateEmail(templateKey, { ...variables, subject });

  let override = templateOverride;
  if (!override) {
    const allOverrides = await getTemplateOverrides();
    override = allOverrides[templateKey] || null;
  }

  if (!override || !override.enabled) {
    return {
      subject: subject || defaultBuilt.subject,
      html: defaultBuilt.html,
    };
  }

  const resolvedSubject = subject
    || renderTemplateString(override.subject, variables)
    || defaultBuilt.subject;

  if (!override.bodyHtml) {
    return {
      subject: resolvedSubject,
      html: defaultBuilt.html,
    };
  }

  const bodyHtml = renderTemplateString(override.bodyHtml, variables);

  return {
    subject: resolvedSubject,
    html: baseTemplate({
      title: resolvedSubject,
      previewText: resolvedSubject,
      bodyHtml,
    }),
  };
}

async function sendTemplatedEmail({ to, templateKey, variables = {}, subject, from, templateOverride = null }) {
  if (!to) {
    throw new Error('Recipient email is required');
  }

  const built = await resolveTemplateEmail({ templateKey, variables, subject, templateOverride });

  const mailOptions = {
    from: from || process.env.SENDER_EMAIL || process.env.EMAIL_USER || 'noreply@attendanceapp.com',
    to,
    subject: subject || built.subject,
    html: built.html
  };

  await transporter.sendMail(mailOptions);
  return true;
}

async function sendAttendanceAlert(student, subject, className, date, status) {
  try {
    await sendTemplatedEmail({
      to: student.parentEmail || student.email,
      templateKey: 'attendance_alert',
      variables: {
        studentName: student.name,
        subjectName: subject.subjectName,
        className,
        date,
        status
      }
    });
    console.log(`Email sent to ${student.parentEmail || student.email}`);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error.message);
    return false;
  }
}

async function sendLeaveStatusUpdate(leaveRequest, student) {
  try {
    await sendTemplatedEmail({
      to: student.email,
      templateKey: 'leave_status_update',
      variables: {
        studentName: student.name,
        status: leaveRequest.status,
        date: leaveRequest.date,
        reason: leaveRequest.reason,
        reviewComment: leaveRequest.reviewComment
      }
    });
    return true;
  } catch (error) {
    console.error('Email sending failed:', error.message);
    return false;
  }
}

async function sendPasswordResetEmail(userEmail, token) {
    const resetLink = `${process.env.BASE_URL || 'http://localhost:3000'}/html/reset-password.html?token=${token}`;

    try {
    await sendTemplatedEmail({
      to: userEmail,
      templateKey: 'password_reset',
      variables: { resetLink }
    });
        console.log(`Password reset email sent to ${userEmail}`);
        return true;
    } catch (error) {
        console.error('Password reset email sending failed:', error);   
        // Optionally, throw the error to be caught by the controller
        throw error;
    }
}

async function sendAdminGeneratedPasswordEmail(userEmail, tempPassword) {
  await sendTemplatedEmail({
    to: userEmail,
    templateKey: 'admin_password_reset',
    variables: { tempPassword }
  });
  return true;
}

function getEmailTemplateKeys() {
  return Object.keys(templateBuilders);
}

function getEmailTemplateCatalog() {
  return getEmailTemplateKeys().map((templateKey) => {
    const sample = TEMPLATE_SAMPLE_VARIABLES[templateKey] || {};
    const preview = buildTemplateEmail(templateKey, sample);

    return {
      templateKey,
      defaultSubject: preview.subject,
      variableKeys: TEMPLATE_VARIABLE_KEYS[templateKey] || [],
    };
  });
}

module.exports = {
  EMAIL_TEMPLATE_SETTING_KEY,
  sendAttendanceAlert,
  sendLeaveStatusUpdate,
  sendPasswordResetEmail,
  sendAdminGeneratedPasswordEmail,
  sendTemplatedEmail,
  getEmailTemplateKeys,
  getEmailTemplateCatalog,
  getTemplateOverrides,
  normalizeTemplateOverrides,
  renderTemplateString,
};
