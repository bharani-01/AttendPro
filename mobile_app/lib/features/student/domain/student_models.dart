class StudentProfile {
  const StudentProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.classId,
    required this.className,
    required this.subjects,
    this.uniqueId,
    this.department,
    this.batch,
    this.year,
  });

  final String id;
  final String name;
  final String email;
  final String classId;
  final String className;
  final List<StudentSubject> subjects;
  final String? uniqueId;
  final String? department;
  final String? batch;
  final int? year;

  factory StudentProfile.fromJson(Map<String, dynamic> json) {
    final assignedClass = json['assignedClass'];
    final classMap = assignedClass is Map<String, dynamic>
        ? assignedClass
        : <String, dynamic>{};
    final assignedSubjects = json['assignedSubjects'];
    final subjectsList = assignedSubjects is List ? assignedSubjects : const [];

    return StudentProfile(
      id: (json['_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      classId: (classMap['_id'] ?? '').toString(),
      className: (classMap['className'] ?? '').toString(),
      uniqueId: (json['uniqueId'] ?? '').toString().trim().isEmpty
          ? null
          : (json['uniqueId'] ?? '').toString(),
      department:
          (json['department'] ?? classMap['department'] ?? '')
              .toString()
              .trim()
              .isEmpty
          ? null
          : (json['department'] ?? classMap['department']).toString(),
      batch:
          (json['batch'] ?? classMap['batch'] ?? '').toString().trim().isEmpty
          ? null
          : (json['batch'] ?? classMap['batch']).toString(),
      year:
          (json['year'] as num?)?.toInt() ??
          (classMap['year'] as num?)?.toInt(),
      subjects: subjectsList
          .whereType<Map<String, dynamic>>()
          .map(StudentSubject.fromJson)
          .toList(growable: false),
    );
  }
}

class StudentSubject {
  const StudentSubject({
    required this.id,
    required this.subjectName,
    required this.subjectCode,
  });

  final String id;
  final String subjectName;
  final String subjectCode;

  factory StudentSubject.fromJson(Map<String, dynamic> json) {
    return StudentSubject(
      id: (json['_id'] ?? '').toString(),
      subjectName: (json['subjectName'] ?? '').toString(),
      subjectCode: (json['subjectCode'] ?? '').toString(),
    );
  }
}

class AttendanceOverall {
  const AttendanceOverall({
    required this.totalClasses,
    required this.totalPresent,
    required this.attendancePercentage,
  });

  final int totalClasses;
  final int totalPresent;
  final double attendancePercentage;

  int get totalAbsent => totalClasses - totalPresent;

  factory AttendanceOverall.fromJson(Map<String, dynamic> json) {
    return AttendanceOverall(
      totalClasses: (json['totalClasses'] as num?)?.toInt() ?? 0,
      totalPresent: (json['totalPresent'] as num?)?.toInt() ?? 0,
      attendancePercentage:
          (json['attendancePercentage'] as num?)?.toDouble() ?? 0,
    );
  }
}

class SubjectAttendanceSummary {
  const SubjectAttendanceSummary({
    required this.subjectId,
    required this.subjectName,
    required this.subjectCode,
    required this.totalClasses,
    required this.present,
    required this.absent,
    required this.attendancePercentage,
  });

  final String subjectId;
  final String subjectName;
  final String subjectCode;
  final int totalClasses;
  final int present;
  final int absent;
  final double attendancePercentage;

  factory SubjectAttendanceSummary.fromJson(Map<String, dynamic> json) {
    return SubjectAttendanceSummary(
      subjectId: (json['subjectId'] ?? '').toString(),
      subjectName: (json['subjectName'] ?? '').toString(),
      subjectCode: (json['subjectCode'] ?? '').toString(),
      totalClasses: (json['totalClasses'] as num?)?.toInt() ?? 0,
      present: (json['present'] as num?)?.toInt() ?? 0,
      absent: (json['absent'] as num?)?.toInt() ?? 0,
      attendancePercentage:
          (json['attendancePercentage'] as num?)?.toDouble() ?? 0,
    );
  }
}

class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.date,
    required this.period,
    required this.status,
    required this.subjectName,
    required this.subjectCode,
  });

  final String id;
  final DateTime? date;
  final int period;
  final String status;
  final String subjectName;
  final String subjectCode;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    final subject = json['subject'] is Map<String, dynamic>
        ? json['subject'] as Map<String, dynamic>
        : <String, dynamic>{};

    return AttendanceRecord(
      id: (json['_id'] ?? '').toString(),
      date: DateTime.tryParse((json['date'] ?? '').toString()),
      period: (json['period'] as num?)?.toInt() ?? 0,
      status: (json['status'] ?? '').toString(),
      subjectName: (subject['subjectName'] ?? '').toString(),
      subjectCode: (subject['subjectCode'] ?? '').toString(),
    );
  }
}

class TimetableItem {
  const TimetableItem({
    required this.id,
    required this.day,
    required this.period,
    required this.subjectName,
    required this.subjectCode,
    required this.facultyName,
    required this.className,
    required this.isSubstitution,
  });

  final String id;
  final String day;
  final int period;
  final String subjectName;
  final String subjectCode;
  final String facultyName;
  final String className;
  final bool isSubstitution;

  factory TimetableItem.fromJson(Map<String, dynamic> json) {
    final subject = json['subject'] is Map<String, dynamic>
        ? json['subject'] as Map<String, dynamic>
        : <String, dynamic>{};
    final faculty = json['faculty'] is Map<String, dynamic>
        ? json['faculty'] as Map<String, dynamic>
        : <String, dynamic>{};
    final cls = json['class'] is Map<String, dynamic>
        ? json['class'] as Map<String, dynamic>
        : <String, dynamic>{};

    return TimetableItem(
      id: (json['_id'] ?? '').toString(),
      day: (json['day'] ?? '').toString(),
      period: (json['period'] as num?)?.toInt() ?? 0,
      subjectName: (subject['subjectName'] ?? subject['name'] ?? '').toString(),
      subjectCode: (subject['subjectCode'] ?? '').toString(),
      facultyName: (faculty['name'] ?? '').toString(),
      className: (cls['className'] ?? cls['name'] ?? '').toString(),
      isSubstitution: json['isSubstitution'] == true,
    );
  }
}

class AnnouncementItem {
  const AnnouncementItem({
    required this.id,
    required this.title,
    required this.content,
    required this.createdBy,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String content;
  final String createdBy;
  final DateTime? createdAt;

  factory AnnouncementItem.fromJson(Map<String, dynamic> json) {
    final createdBy = json['createdBy'] is Map<String, dynamic>
        ? json['createdBy'] as Map<String, dynamic>
        : <String, dynamic>{};

    return AnnouncementItem(
      id: (json['_id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      createdBy: (createdBy['name'] ?? 'Admin').toString(),
      createdAt: DateTime.tryParse((json['createdAt'] ?? '').toString()),
    );
  }
}

class LeaveRequestItem {
  const LeaveRequestItem({
    required this.id,
    required this.reason,
    required this.status,
    required this.period,
    required this.date,
    required this.subjectName,
    required this.className,
    required this.reviewComment,
  });

  final String id;
  final String reason;
  final String status;
  final int period;
  final DateTime? date;
  final String subjectName;
  final String className;
  final String reviewComment;

  factory LeaveRequestItem.fromJson(Map<String, dynamic> json) {
    final subject = json['subject'] is Map<String, dynamic>
        ? json['subject'] as Map<String, dynamic>
        : <String, dynamic>{};
    final cls = json['class'] is Map<String, dynamic>
        ? json['class'] as Map<String, dynamic>
        : <String, dynamic>{};

    return LeaveRequestItem(
      id: (json['_id'] ?? '').toString(),
      reason: (json['reason'] ?? '').toString(),
      status: (json['status'] ?? 'pending').toString(),
      period: (json['period'] as num?)?.toInt() ?? 0,
      date: DateTime.tryParse((json['date'] ?? '').toString()),
      subjectName: (subject['subjectName'] ?? '').toString(),
      className: (cls['className'] ?? '').toString(),
      reviewComment: (json['reviewComment'] ?? '').toString(),
    );
  }
}

class AttendanceSummaryBundle {
  const AttendanceSummaryBundle({
    required this.overall,
    required this.subjectSummary,
  });

  final AttendanceOverall overall;
  final List<SubjectAttendanceSummary> subjectSummary;
}

class MessagableUser {
  const MessagableUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  final String id;
  final String name;
  final String email;
  final String role;

  factory MessagableUser.fromJson(Map<String, dynamic> json) {
    return MessagableUser(
      id: (json['_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
    );
  }
}

class ConversationItem {
  const ConversationItem({
    required this.id,
    required this.otherParticipantId,
    required this.displayName,
    required this.lastMessage,
    required this.updatedAt,
    required this.unreadCount,
  });

  final String id;
  final String otherParticipantId;
  final String displayName;
  final String lastMessage;
  final DateTime? updatedAt;
  final int unreadCount;

  factory ConversationItem.fromJson(
    Map<String, dynamic> json,
    String currentUserId,
  ) {
    final participants = json['participants'] is List
        ? json['participants'] as List
        : const [];
    String displayName = 'Conversation';
    String otherParticipantId = '';

    for (final p in participants) {
      if (p is Map<String, dynamic> &&
          (p['_id'] ?? '').toString() != currentUserId) {
        otherParticipantId = (p['_id'] ?? '').toString();
        displayName = (p['name'] ?? displayName).toString();
      }
    }

    final lastMsg = json['lastMessage'] is Map<String, dynamic>
        ? json['lastMessage'] as Map<String, dynamic>
        : <String, dynamic>{};

    return ConversationItem(
      id: (json['_id'] ?? '').toString(),
      otherParticipantId: otherParticipantId,
      displayName: displayName,
      lastMessage: (lastMsg['content'] ?? '').toString(),
      updatedAt: DateTime.tryParse((json['updatedAt'] ?? '').toString()),
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.content,
    required this.senderId,
    required this.senderName,
    required this.isRead,
    required this.createdAt,
  });

  final String id;
  final String content;
  final String senderId;
  final String senderName;
  final bool isRead;
  final DateTime? createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] is Map<String, dynamic>
        ? json['sender'] as Map<String, dynamic>
        : <String, dynamic>{};

    return ChatMessage(
      id: (json['_id'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      senderId: (sender['_id'] ?? '').toString(),
      senderName: (sender['name'] ?? 'Unknown').toString(),
      isRead: json['isRead'] == true,
      createdAt: DateTime.tryParse((json['createdAt'] ?? '').toString()),
    );
  }
}
