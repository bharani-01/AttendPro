import 'package:dio/dio.dart';
import 'package:mobile_shared/mobile_shared.dart';

import '../domain/models/faculty_models.dart';

class FacultyRepository {
  FacultyRepository()
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

  Options _authOptions(String accessToken) {
    return Options(headers: {'Authorization': 'Bearer $accessToken'});
  }

  Future<List<FacultyTimetableItem>> fetchTodaySchedule({
    required String accessToken,
  }) async {
    final response = await _dio.get<dynamic>(
      '/timetable/faculty/today',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    final list = _asList(body['schedule']);
    return list
        .whereType<Map<String, dynamic>>()
        .map(FacultyTimetableItem.fromJson)
        .toList(growable: false);
  }

  Future<List<FacultyLeaveRequestItem>> fetchLeaveRequests({
    required String accessToken,
  }) async {
    final response = await _dio.get<dynamic>(
      '/leave-requests',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    final list = _asList(body['leaveRequests']);
    return list
        .whereType<Map<String, dynamic>>()
        .map(FacultyLeaveRequestItem.fromJson)
        .toList(growable: false);
  }

  Future<void> approveLeave({
    required String accessToken,
    required String leaveId,
    String comment = '',
  }) async {
    await _dio.put<dynamic>(
      '/leave-requests/$leaveId/approve',
      options: _authOptions(accessToken),
      data: {'comment': comment},
    );
  }

  Future<void> rejectLeave({
    required String accessToken,
    required String leaveId,
    String comment = '',
  }) async {
    await _dio.put<dynamic>(
      '/leave-requests/$leaveId/reject',
      options: _authOptions(accessToken),
      data: {'comment': comment},
    );
  }

  Future<List<FacultyMessagableUser>> fetchMessagableUsers({
    required String accessToken,
  }) async {
    final response = await _dio.get<dynamic>(
      '/messages/messagable-users',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    final list = _asList(body['messagableUsers']);
    return list
        .whereType<Map<String, dynamic>>()
        .map(FacultyMessagableUser.fromJson)
        .toList(growable: false);
  }

  Future<List<FacultyConversationItem>> fetchConversations({
    required String accessToken,
    required String currentUserId,
  }) async {
    final response = await _dio.get<dynamic>(
      '/messages/conversations',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    final list = _asList(body['conversations']);
    return list
        .whereType<Map<String, dynamic>>()
        .map((json) => FacultyConversationItem.fromJson(json, currentUserId))
        .toList(growable: false);
  }

  Future<String> getOrCreateConversation({
    required String accessToken,
    required String receiverId,
  }) async {
    final response = await _dio.post<dynamic>(
      '/messages/conversations',
      options: _authOptions(accessToken),
      data: {'receiverId': receiverId},
    );

    final body = _asMap(response.data);
    return (body['conversationId'] ?? '').toString();
  }

  Future<List<FacultyChatMessage>> fetchMessages({
    required String accessToken,
    required String conversationId,
  }) async {
    final response = await _dio.get<dynamic>(
      '/messages/conversations/$conversationId',
      options: _authOptions(accessToken),
    );

    final body = _asMap(response.data);
    final list = _asList(body['messages']);
    return list
        .whereType<Map<String, dynamic>>()
        .map(FacultyChatMessage.fromJson)
        .toList(growable: false);
  }

  Future<void> sendMessage({
    required String accessToken,
    required String conversationId,
    required String receiverId,
    required String content,
  }) async {
    await _dio.post<dynamic>(
      '/messages/messages',
      options: _authOptions(accessToken),
      data: {
        'conversationId': conversationId,
        'receiverId': receiverId,
        'content': content,
      },
    );
  }

  Future<List<FacultyClassStudent>> fetchClassStudents({
    required String accessToken,
    required String classId,
  }) async {
    final response = await _dio.get<dynamic>(
      '/classes/$classId/students',
      options: _authOptions(accessToken),
      queryParameters: const {'limit': 200},
    );

    final body = _asMap(response.data);
    final list = _asList(body['students']);
    return list
        .whereType<Map<String, dynamic>>()
        .map(FacultyClassStudent.fromJson)
        .toList(growable: false);
  }

  Future<List<FacultyAttendanceRecord>> fetchClassAttendance({
    required String accessToken,
    required String classId,
    required String subjectId,
    required DateTime date,
    required int period,
  }) async {
    final day =
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

    final response = await _dio.get<dynamic>(
      '/attendance/class',
      options: _authOptions(accessToken),
      queryParameters: {
        'classId': classId,
        'subjectId': subjectId,
        'date': day,
        'period': period,
      },
    );

    final body = _asMap(response.data);
    final list = _asList(body['attendances']);
    return list
        .whereType<Map<String, dynamic>>()
        .map(FacultyAttendanceRecord.fromJson)
        .toList(growable: false);
  }

  Future<void> bulkMarkAttendance({
    required String accessToken,
    required String classId,
    required String subjectId,
    required DateTime date,
    required int period,
    required Map<String, String> studentStatus,
  }) async {
    final payload = studentStatus.entries
        .map(
          (entry) => {
            'studentId': entry.key,
            'subjectId': subjectId,
            'classId': classId,
            'date': date.toIso8601String(),
            'period': period,
            'status': entry.value,
          },
        )
        .toList(growable: false);

    await _dio.post<dynamic>(
      '/attendance/bulk',
      options: _authOptions(accessToken),
      data: {'attendanceData': payload},
    );
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((key, val) => MapEntry(key.toString(), val));
    }
    return <String, dynamic>{};
  }

  List<dynamic> _asList(dynamic value) {
    if (value is List) return value;
    return const <dynamic>[];
  }
}
