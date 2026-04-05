let client = null;
let fromNumber = null;

function initTwilio() {
  if (client) return client;
  
  const twilioSid = process.env.TWILIO_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (twilioSid && twilioToken && twilioSid.startsWith('AC')) {
    try {
      const twilio = require('twilio');
      client = twilio(twilioSid, twilioToken);
      fromNumber = process.env.TWILIO_PHONE_NUMBER;
      console.log('Twilio SMS service initialized');
    } catch (error) {
      console.error('Failed to initialize Twilio:', error.message);
    }
  } else {
    console.log('SMS service: Twilio credentials not configured - SMS disabled');
  }
  return client;
}

async function sendSMSAlert(to, message) {
  if (!client) {
    initTwilio();
  }
  
  if (!client) {
    console.log('SMS (disabled):', { to, message });
    return false;
  }

  try {
    await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });
    console.log(`SMS sent to ${to}`);
    return true;
  } catch (error) {
    console.error('SMS sending failed:', error.message);
    return false;
  }
}

async function sendAttendanceSMS(student, subject, className, date, status) {
  const message = `Attendance Alert: Your ward ${student.name} was marked ${status} for ${subject.subjectName} on ${new Date(date).toLocaleDateString()}. - Attendance Management System`;

  const parentPhones = Array.isArray(student.parentPhones)
    ? student.parentPhones.filter(Boolean)
    : [];

  if (parentPhones.length > 0) {
    for (const phone of parentPhones) {
      await sendSMSAlert(phone, message);
    }
    return;
  }

  if (student.parentPhone) {
    await sendSMSAlert(student.parentPhone, message);
  }
}

async function sendLeaveStatusSMS(leaveRequest, student) {
  const message = `Leave Request Update: Your ${leaveRequest.status} leave request for ${new Date(leaveRequest.date).toLocaleDateString()} has been ${leaveRequest.status}. - Attendance Management System`;
  
  await sendSMSAlert(student.phone, message);
}

module.exports = {
  sendSMSAlert,
  sendAttendanceSMS,
  sendLeaveStatusSMS
};
