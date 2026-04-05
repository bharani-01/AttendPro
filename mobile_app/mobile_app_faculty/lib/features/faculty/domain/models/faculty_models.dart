class FacultyTimetableItem {
  const FacultyTimetableItem({
    required this.id,
    required this.period,
    required this.day,
    required this.subjectId,
    required this.classId,
    required this.subjectName,
    required this.className,
  });

  final String id;
  final int period;
  final String day;
  final String subjectId;
  final String classId;
  final String subjectName;
  final String className;

  factory FacultyTimetableItem.fromJson(Map<String, dynamic> json) {
    final subject = json['subject'] is Map<String, dynamic>
        ? json['subject'] as Map<String, dynamic>
        : <String, dynamic>{};
    final cls = json['class'] is Map<String, dynamic>
        ? json['class'] as Map<String, dynamic>
        : <String, dynamic>{};

    return FacultyTimetableItem(
      id: (json['_id'] ?? '').toString(),
      period: (json['period'] as num?)?.toInt() ?? 0,
      day: (json['day'] ?? '').toString(),
      subjectId: (subject['_id'] ?? '').toString(),
      classId: (cls['_id'] ?? '').toString(),
      subjectName: (subject['subjectName'] ?? '').toString(),
      className: (cls['className'] ?? '').toString(),
    );
  }
}

class FacultyClassStudent {
  const FacultyClassStudent({
    required this.id,
    required this.name,
    required this.email,
    required this.uniqueId,
  });

  final String id;
  final String name;
  final String email;
  final String uniqueId;

  factory FacultyClassStudent.fromJson(Map<String, dynamic> json) {
    return FacultyClassStudent(
      id: (json['_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      uniqueId: (json['uniqueId'] ?? '').toString(),
    );
  }
}

class FacultyAttendanceRecord {
  const FacultyAttendanceRecord({
    required this.id,
    required this.studentId,
    required this.status,
  });

  final String id;
  final String studentId;
  final String status;

  factory FacultyAttendanceRecord.fromJson(Map<String, dynamic> json) {
    final student = json['student'] is Map<String, dynamic>
        ? json['student'] as Map<String, dynamic>
        : <String, dynamic>{};

    return FacultyAttendanceRecord(
      id: (json['_id'] ?? '').toString(),
      studentId: (student['_id'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
    );
  }
}

class FacultyLeaveRequestItem {
  const FacultyLeaveRequestItem({
    required this.id,
    required this.studentName,
    required this.subjectName,
    required this.className,
    required this.reason,
    required this.status,
    required this.period,
    required this.date,
  });

  final String id;
  final String studentName;
  final String subjectName;
  final String className;
  final String reason;
  final String status;
  final int period;
  final DateTime? date;

  factory FacultyLeaveRequestItem.fromJson(Map<String, dynamic> json) {
    final student = json['student'] is Map<String, dynamic>
        ? json['student'] as Map<String, dynamic>
        : <String, dynamic>{};
    final subject = json['subject'] is Map<String, dynamic>
        ? json['subject'] as Map<String, dynamic>
        : <String, dynamic>{};
    final cls = json['class'] is Map<String, dynamic>
        ? json['class'] as Map<String, dynamic>
        : <String, dynamic>{};

    return FacultyLeaveRequestItem(
      id: (json['_id'] ?? '').toString(),
      studentName: (student['name'] ?? '').toString(),
      subjectName: (subject['subjectName'] ?? '').toString(),
      className: (cls['className'] ?? '').toString(),
      reason: (json['reason'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      period: (json['period'] as num?)?.toInt() ?? 0,
      date: DateTime.tryParse((json['date'] ?? '').toString()),
    );
  }
}

class FacultyMessagableUser {
  const FacultyMessagableUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  final String id;
  final String name;
  final String email;
  final String role;

  factory FacultyMessagableUser.fromJson(Map<String, dynamic> json) {
    return FacultyMessagableUser(
      id: (json['_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
    );
  }
}

class FacultyConversationItem {
  const FacultyConversationItem({
    required this.id,
    required this.otherParticipantId,
    required this.displayName,
    required this.lastMessage,
    required this.unreadCount,
  });

  final String id;
  final String otherParticipantId;
  final String displayName;
  final String lastMessage;
  final int unreadCount;

  factory FacultyConversationItem.fromJson(
    Map<String, dynamic> json,
    String currentUserId,
  ) {
    final participants = json['participants'] is List
        ? json['participants'] as List
        : const [];

    var name = 'Conversation';
    var otherId = '';
    for (final p in participants) {
      if (p is Map<String, dynamic> &&
          (p['_id'] ?? '').toString() != currentUserId) {
        otherId = (p['_id'] ?? '').toString();
        name = (p['name'] ?? name).toString();
      }
    }

    final lastMsg = json['lastMessage'] is Map<String, dynamic>
        ? json['lastMessage'] as Map<String, dynamic>
        : <String, dynamic>{};

    return FacultyConversationItem(
      id: (json['_id'] ?? '').toString(),
      otherParticipantId: otherId,
      displayName: name,
      lastMessage: (lastMsg['content'] ?? '').toString(),
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class FacultyChatMessage {
  const FacultyChatMessage({
    required this.id,
    required this.content,
    required this.senderId,
    required this.senderName,
    required this.createdAt,
  });

  final String id;
  final String content;
  final String senderId;
  final String senderName;
  final DateTime? createdAt;

  factory FacultyChatMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] is Map<String, dynamic>
        ? json['sender'] as Map<String, dynamic>
        : <String, dynamic>{};

    return FacultyChatMessage(
      id: (json['_id'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      senderId: (sender['_id'] ?? '').toString(),
      senderName: (sender['name'] ?? '').toString(),
      createdAt: DateTime.tryParse((json['createdAt'] ?? '').toString()),
    );
  }
}
