const User = require('./User');
const Subject = require('./Subject');
const Class = require('./Class');
const Timetable = require('./Timetable');
const Attendance = require('./Attendance');
const AuditLog = require('./AuditLog');
const LeaveRequest = require('./LeaveRequest');
const QRSession = require('./QRSession');

module.exports = {
    AppSetting: require('./AppSetting'),
    Attendance: require('./Attendance'),
    AuditLog: require('./AuditLog'),
    Class: require('./Class'),
    Conversation: require('./Conversation'),
    EmailEventLog: require('./EmailEventLog'),
    Exam: require('./Exam'),
    ExamSchedule: require('./ExamSchedule'),
    LeaveRequest: require('./LeaveRequest'),
    LowAttendanceEmailLog: require('./LowAttendanceEmailLog'),
    Message: require('./Message'),
    Mark: require('./Mark'),
    Permission: require('./Permission'),
    QRSession: require('./QRSession'),
    RevokedToken: require('./RevokedToken'),
    Role: require('./Role'),
    Subject: require('./Subject'),
    Substitution: require('./Substitution'),
    Timetable: require('./Timetable'),
    User: require('./User'),
    Announcement: require('./Announcement')
    ,AnnouncementSeen: require('./AnnouncementSeen')
};
