import 'package:dio/dio.dart';

import '../../../core/config/app_config.dart';
import '../domain/student_models.dart';

class StudentRepository {
  StudentRepository()
    : _dio = Dio(
        BaseOptions(
          baseUrl: AppConfig.apiBaseUrl,
          connectTimeout: AppConfig.connectTimeout,
          receiveTimeout: AppConfig.receiveTimeout,
          headers: const {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
        ),
      );

  final Dio _dio;
  static const Duration _attendanceReceiveTimeout = Duration(seconds: 90);

  Future<StudentProfile> fetchProfile({required String accessToken}) async {
    final response = await _dio.get<dynamic>(
      '/auth/profile',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    final user = _asMap(body['user']);
    return StudentProfile.fromJson(user);
  }

  Future<AttendanceSummaryBundle> fetchAttendanceSummary({
    required String accessToken,
  }) async {
    return fetchAttendanceSummaryFiltered(accessToken: accessToken);
  }

  Future<AttendanceSummaryBundle> fetchAttendanceSummaryFiltered({
    required String accessToken,
    DateTime? startDate,
    DateTime? endDate,
    String? subjectId,
  }) async {
    final response = await _dio.get<dynamic>(
      '/attendance/student/summary',
      queryParameters: _attendanceQueryParams(
        startDate: startDate,
        endDate: endDate,
        subjectId: subjectId,
      ),
      options: _authOptions(
        accessToken,
        receiveTimeout: _attendanceReceiveTimeout,
      ),
    );

    final body = _asMap(response.data);
    final overall = AttendanceOverall.fromJson(_asMap(body['overall']));
    final summary = _asList(body['summary'])
        .whereType<Map<String, dynamic>>()
        .map(SubjectAttendanceSummary.fromJson)
        .toList(growable: false);

    return AttendanceSummaryBundle(overall: overall, subjectSummary: summary);
  }

  Future<List<AttendanceRecord>> fetchAttendanceRecords({
    required String accessToken,
  }) async {
    return fetchAttendanceRecordsFiltered(accessToken: accessToken);
  }

  Future<List<AttendanceRecord>> fetchAttendanceRecordsFiltered({
    required String accessToken,
    DateTime? startDate,
    DateTime? endDate,
    String? subjectId,
  }) async {
    final response = await _dio.get<dynamic>(
      '/attendance/student',
      queryParameters: _attendanceQueryParams(
        startDate: startDate,
        endDate: endDate,
        subjectId: subjectId,
      ),
      options: _authOptions(
        accessToken,
        receiveTimeout: _attendanceReceiveTimeout,
      ),
    );

    final body = _asMap(response.data);
    return _asList(body['attendances'])
        .whereType<Map<String, dynamic>>()
        .map(AttendanceRecord.fromJson)
        .toList(growable: false);
  }

  Future<List<TimetableItem>> fetchTodaySchedule({
    required String accessToken,
  }) async {
    final response = await _dio.get<dynamic>(
      '/timetable/today',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    return _asList(body['schedule'])
        .whereType<Map<String, dynamic>>()
        .map(TimetableItem.fromJson)
        .toList(growable: false);
  }

  Future<List<TimetableItem>> fetchWeeklyTimetable({
    required String accessToken,
    required String classId,
  }) async {
    if (classId.trim().isEmpty) {
      return const <TimetableItem>[];
    }

    final response = await _dio.get<dynamic>(
      '/timetable',
      queryParameters: {'classId': classId},
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    return _asList(body['timetables'])
        .whereType<Map<String, dynamic>>()
        .map(TimetableItem.fromJson)
        .toList(growable: false);
  }

  Future<List<AnnouncementItem>> fetchAnnouncements({
    required String accessToken,
  }) async {
    final response = await _dio.get<dynamic>(
      '/announcements',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    return _asList(body['announcements'])
        .whereType<Map<String, dynamic>>()
        .map(AnnouncementItem.fromJson)
        .toList(growable: false);
  }

  Future<List<LeaveRequestItem>> fetchLeaveRequests({
    required String accessToken,
  }) async {
    final response = await _dio.get<dynamic>(
      '/leave-requests',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    return _asList(body['leaveRequests'])
        .whereType<Map<String, dynamic>>()
        .map(LeaveRequestItem.fromJson)
        .toList(growable: false);
  }

  Future<List<StudentSubject>> fetchClassSubjects({
    required String accessToken,
    required String classId,
  }) async {
    if (classId.trim().isEmpty) {
      return const <StudentSubject>[];
    }

    final response = await _dio.get<dynamic>(
      '/classes/$classId',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    final classData = _asMap(body['class']);
    final assignedSubjects = _asList(classData['assignedSubjects']);

    return assignedSubjects
        .whereType<Map<String, dynamic>>()
        .map(StudentSubject.fromJson)
        .where((s) => s.id.isNotEmpty)
        .toList(growable: false);
  }

  Future<void> submitLeaveRequest({
    required String accessToken,
    required String classId,
    required String subjectId,
    required DateTime date,
    required int period,
    required String reason,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/leave-requests',
        options: _authOptions(accessToken),
        data: {
          'classId': classId,
          'subjectId': subjectId,
          'date': date.toIso8601String(),
          'period': period,
          'reason': reason,
        },
      );
    } on DioException catch (e) {
      throw Exception(_extractDioError(e));
    }
  }

  Future<String> checkInWithQrSession({
    required String accessToken,
    required String sessionId,
    required String token,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        '/qr/submit',
        options: _authOptions(accessToken),
        data: {'sessionId': sessionId, 'qrToken': token},
      );

      final body = _asMap(response.data);
      return (body['message'] ?? 'Check-in completed').toString();
    } on DioException catch (e) {
      throw Exception(_extractDioError(e));
    }
  }

  Future<List<MessagableUser>> fetchMessagableUsers({
    required String accessToken,
  }) async {
    final response = await _dio.get<dynamic>(
      '/messages/messagable-users',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    return _asList(body['messagableUsers'])
        .whereType<Map<String, dynamic>>()
        .map(MessagableUser.fromJson)
        .toList(growable: false);
  }

  Future<List<ConversationItem>> fetchConversations({
    required String accessToken,
    required String currentUserId,
  }) async {
    final response = await _dio.get<dynamic>(
      '/messages/conversations',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    return _asList(body['conversations'])
        .whereType<Map<String, dynamic>>()
        .map((json) => ConversationItem.fromJson(json, currentUserId))
        .toList(growable: false);
  }

  Future<String> getOrCreateConversation({
    required String accessToken,
    required String receiverId,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        '/messages/conversations',
        options: _authOptions(accessToken),
        data: {'receiverId': receiverId},
      );

      final body = _asMap(response.data);
      return (body['conversationId'] ?? '').toString();
    } on DioException catch (e) {
      throw Exception(_extractDioError(e));
    }
  }

  Future<List<ChatMessage>> fetchMessages({
    required String accessToken,
    required String conversationId,
  }) async {
    final response = await _dio.get<dynamic>(
      '/messages/conversations/$conversationId',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    return _asList(body['messages'])
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList(growable: false);
  }

  Future<void> sendMessage({
    required String accessToken,
    required String conversationId,
    required String receiverId,
    required String content,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/messages/messages',
        options: _authOptions(accessToken),
        data: {
          'conversationId': conversationId,
          'receiverId': receiverId,
          'content': content,
        },
      );
    } on DioException catch (e) {
      throw Exception(_extractDioError(e));
    }
  }

  Options _authOptions(String accessToken, {Duration? receiveTimeout}) {
    return Options(
      headers: {'Authorization': 'Bearer $accessToken'},
      receiveTimeout: receiveTimeout,
    );
  }

  Map<String, dynamic> _attendanceQueryParams({
    DateTime? startDate,
    DateTime? endDate,
    String? subjectId,
  }) {
    final params = <String, dynamic>{};
    if (startDate != null) {
      params['startDate'] = _serializeDateOnly(startDate);
    }
    if (endDate != null) {
      params['endDate'] = _serializeDateOnly(endDate);
    }
    if (subjectId != null && subjectId.trim().isNotEmpty) {
      params['subjectId'] = subjectId.trim();
    }
    return params;
  }

  String _serializeDateOnly(DateTime value) {
    final date = DateTime(value.year, value.month, value.day);
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    return <String, dynamic>{};
  }

  List<dynamic> _asList(dynamic value) {
    if (value is List<dynamic>) return value;
    return const <dynamic>[];
  }

  String _extractDioError(DioException e) {
    final body = _asMap(e.response?.data);
    final message = (body['error'] ?? body['message'] ?? '').toString().trim();
    if (message.isNotEmpty) {
      return message;
    }

    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      if (e.type == DioExceptionType.receiveTimeout) {
        return 'Server is taking longer to return attendance data. Try a smaller date range or retry.';
      }
      return 'Unable to reach server. Check internet or server URL.';
    }

    final status = e.response?.statusCode;
    if (status == 400) {
      return 'Request was rejected. Please check input and try again.';
    }
    if (status == 401) {
      return 'Session expired. Please login again.';
    }

    return 'Request failed. Please try again.';
  }
}
