const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || process.env.BREVO_SMTP_KEY || 'your-brevo-smtp-key'
  }
});

async function sendAttendanceAlert(student, subject, className, date, status) {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@attendanceapp.com',
    to: student.parentEmail || student.email,
    subject: `Attendance Alert: ${status.toUpperCase()} - ${subject.subjectName}`,
    html: `
      <h2>Attendance Notification</h2>
      <p>Dear Parent/Guardian,</p>
      <p>Your ward <strong>${student.name}</strong> was marked <strong>${status}</strong> for:</p>
      <ul>
        <li><strong>Subject:</strong> ${subject.subjectName}</li>
        <li><strong>Class:</strong> ${className}</li>
        <li><strong>Date:</strong> ${new Date(date).toLocaleDateString()}</li>
      </ul>
      <p>Please contact the faculty if you have any concerns.</p>
      <p>Best regards,<br>Attendance Management System</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${student.parentEmail || student.email}`);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error.message);
    return false;
  }
}

async function sendLeaveStatusUpdate(leaveRequest, student) {
  const statusColors = {
    approved: 'green',
    rejected: 'red'
  };

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@attendanceapp.com',
    to: student.email,
    subject: `Leave Request ${leaveRequest.status.toUpperCase()}`,
    html: `
      <h2>Leave Request Update</h2>
      <p>Dear ${student.name},</p>
      <p>Your leave request has been <strong style="color: ${statusColors[leaveRequest.status]}">${leaveRequest.status}</strong>.</p>
      <ul>
        <li><strong>Date:</strong> ${new Date(leaveRequest.date).toLocaleDateString()}</li>
        <li><strong>Reason:</strong> ${leaveRequest.reason}</li>
        ${leaveRequest.reviewComment ? `<li><strong>Comment:</strong> ${leaveRequest.reviewComment}</li>` : ''}
      </ul>
      <p>Best regards,<br>Attendance Management System</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error.message);
    return false;
  }
}

async function sendPasswordResetEmail(userEmail, token) {
    const resetLink = `${process.env.BASE_URL || 'http://localhost:3000'}/html/reset-password.html?token=${token}`;

    const mailOptions = {
        from: process.env.SENDER_EMAIL || process.env.EMAIL_USER || 'noreply@attendanceapp.com',
        to: userEmail,
        subject: 'Password Reset Request',
        html: `
            <h2>Password Reset Request</h2>
            <p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.</p>
            <p>Please click on the following link, or paste it into your browser to complete the process:</p>
            <a href="${resetLink}">${resetLink}</a>
            <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
            <p>This link is valid for one hour.</p>
            <p>Best regards,<br>Attendance Management System</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Password reset email sent to ${userEmail}`);
        return true;
    } catch (error) {
        console.error('Password reset email sending failed:', error);   
        // Optionally, throw the error to be caught by the controller
        throw error;
    }
}

async function sendAdminGeneratedPasswordEmail(userEmail, tempPassword) {
  const mailOptions = {
    from: process.env.SENDER_EMAIL || process.env.EMAIL_USER || 'noreply@attendanceapp.com',
    to: userEmail,
    subject: 'Your Password Has Been Reset by Admin',
    html: `
      <h2>Password Reset by Administrator</h2>
      <p>Your account password was reset by an administrator.</p>
      <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      <p>Please login and change your password immediately.</p>
      <p>Best regards,<br>Attendance Management System</p>
    `
  };

  await transporter.sendMail(mailOptions);
  return true;
}

module.exports = {
  sendAttendanceAlert,
  sendLeaveStatusUpdate,
  sendPasswordResetEmail,
  sendAdminGeneratedPasswordEmail
};
