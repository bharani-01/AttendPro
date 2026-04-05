import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/session_controller.dart';
import '../data/student_repository.dart';
import '../domain/student_models.dart';

enum AttendanceFilterMode { single, range }

class AttendanceFilterState {
  const AttendanceFilterState({
    required this.mode,
    required this.startDate,
    required this.endDate,
    this.subjectId,
  });

  factory AttendanceFilterState.initial() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return AttendanceFilterState(
      mode: AttendanceFilterMode.single,
      startDate: today,
      endDate: today,
    );
  }

  final AttendanceFilterMode mode;
  final DateTime startDate;
  final DateTime endDate;
  final String? subjectId;

  AttendanceFilterState copyWith({
    AttendanceFilterMode? mode,
    DateTime? startDate,
    DateTime? endDate,
    String? subjectId,
    bool clearSubject = false,
  }) {
    return AttendanceFilterState(
      mode: mode ?? this.mode,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      subjectId: clearSubject ? null : (subjectId ?? this.subjectId),
    );
  }
}

final studentRepositoryProvider = Provider<StudentRepository>((ref) {
  return StudentRepository();
});

final studentAccessTokenProvider = Provider<String?>((ref) {
  return ref.watch(sessionControllerProvider).session?.accessToken;
});

final studentProfileProvider = FutureProvider<StudentProfile>((ref) async {
  final token = ref.watch(studentAccessTokenProvider);
  if (token == null || token.isEmpty) {
    throw Exception('Not authenticated');
  }
  return ref.read(studentRepositoryProvider).fetchProfile(accessToken: token);
});

final studentAttendanceSummaryProvider =
    FutureProvider<AttendanceSummaryBundle>((ref) async {
      final token = ref.watch(studentAccessTokenProvider);
      if (token == null || token.isEmpty) {
        throw Exception('Not authenticated');
      }
      return ref
          .read(studentRepositoryProvider)
          .fetchAttendanceSummary(accessToken: token);
    });

final studentAttendanceRecordsProvider = FutureProvider<List<AttendanceRecord>>(
  (ref) async {
    final token = ref.watch(studentAccessTokenProvider);
    if (token == null || token.isEmpty) {
      throw Exception('Not authenticated');
    }
    return ref
        .read(studentRepositoryProvider)
        .fetchAttendanceRecords(accessToken: token);
  },
);

final studentTodayScheduleProvider = FutureProvider<List<TimetableItem>>((
  ref,
) async {
  final token = ref.watch(studentAccessTokenProvider);
  if (token == null || token.isEmpty) {
    throw Exception('Not authenticated');
  }
  return ref
      .read(studentRepositoryProvider)
      .fetchTodaySchedule(accessToken: token);
});

final studentWeeklyTimetableProvider = FutureProvider<List<TimetableItem>>((
  ref,
) async {
  final token = ref.watch(studentAccessTokenProvider);
  if (token == null || token.isEmpty) {
    throw Exception('Not authenticated');
  }

  final profile = await ref.watch(studentProfileProvider.future);
  if (profile.classId.isEmpty) {
    return const <TimetableItem>[];
  }

  return ref
      .read(studentRepositoryProvider)
      .fetchWeeklyTimetable(accessToken: token, classId: profile.classId);
});

final studentAnnouncementsProvider = FutureProvider<List<AnnouncementItem>>((
  ref,
) async {
  final token = ref.watch(studentAccessTokenProvider);
  if (token == null || token.isEmpty) {
    throw Exception('Not authenticated');
  }
  return ref
      .read(studentRepositoryProvider)
      .fetchAnnouncements(accessToken: token);
});

final studentLeaveRequestsProvider = FutureProvider<List<LeaveRequestItem>>((
  ref,
) async {
  final token = ref.watch(studentAccessTokenProvider);
  if (token == null || token.isEmpty) {
    throw Exception('Not authenticated');
  }
  return ref
      .read(studentRepositoryProvider)
      .fetchLeaveRequests(accessToken: token);
});

final studentClassSubjectsProvider = FutureProvider<List<StudentSubject>>((
  ref,
) async {
  final token = ref.watch(studentAccessTokenProvider);
  final profile = await ref.watch(studentProfileProvider.future);

  if (token == null || token.isEmpty) {
    throw Exception('Not authenticated');
  }

  if (profile.classId.isEmpty) {
    return const <StudentSubject>[];
  }

  return ref
      .read(studentRepositoryProvider)
      .fetchClassSubjects(accessToken: token, classId: profile.classId);
});

final studentAttendanceFilterProvider = StateProvider<AttendanceFilterState>((
  ref,
) {
  return AttendanceFilterState.initial();
});

final studentFilteredAttendanceSummaryProvider =
    FutureProvider<AttendanceSummaryBundle>((ref) async {
      final token = ref.watch(studentAccessTokenProvider);
      if (token == null || token.isEmpty) {
        throw Exception('Not authenticated');
      }

      final filter = ref.watch(studentAttendanceFilterProvider);

      return ref
          .read(studentRepositoryProvider)
          .fetchAttendanceSummaryFiltered(
            accessToken: token,
            startDate: filter.startDate,
            endDate: filter.endDate,
            subjectId: filter.subjectId,
          );
    });

final studentFilteredAttendanceRecordsProvider =
    FutureProvider<List<AttendanceRecord>>((ref) async {
      final token = ref.watch(studentAccessTokenProvider);
      if (token == null || token.isEmpty) {
        throw Exception('Not authenticated');
      }

      final filter = ref.watch(studentAttendanceFilterProvider);

      return ref
          .read(studentRepositoryProvider)
          .fetchAttendanceRecordsFiltered(
            accessToken: token,
            startDate: filter.startDate,
            endDate: filter.endDate,
            subjectId: filter.subjectId,
          );
    });

final studentMessagableUsersProvider = FutureProvider<List<MessagableUser>>((
  ref,
) async {
  final token = ref.watch(studentAccessTokenProvider);
  if (token == null || token.isEmpty) {
    throw Exception('Not authenticated');
  }
  return ref
      .read(studentRepositoryProvider)
      .fetchMessagableUsers(accessToken: token);
});

final studentConversationsProvider = FutureProvider<List<ConversationItem>>((
  ref,
) async {
  final token = ref.watch(studentAccessTokenProvider);
  final session = ref.watch(sessionControllerProvider).session;
  final currentUserId = session?.user.id ?? '';

  if (token == null || token.isEmpty || currentUserId.isEmpty) {
    throw Exception('Not authenticated');
  }

  return ref
      .read(studentRepositoryProvider)
      .fetchConversations(accessToken: token, currentUserId: currentUserId);
});

final studentMessagesProvider =
    FutureProvider.family<List<ChatMessage>, String>((
      ref,
      conversationId,
    ) async {
      final token = ref.watch(studentAccessTokenProvider);
      if (token == null || token.isEmpty) {
        throw Exception('Not authenticated');
      }

      return ref
          .read(studentRepositoryProvider)
          .fetchMessages(accessToken: token, conversationId: conversationId);
    });
