import 'package:dio/dio.dart';
import 'package:mobile_shared/mobile_shared.dart';

import '../domain/models/auth_session.dart';
import '../domain/models/auth_user.dart';

class AuthRepository {
  AuthRepository()
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

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        '/auth/login',
        data: {'email': email.trim().toLowerCase(), 'password': password},
      );

      final body = _asMap(response.data);
      final user = AuthUser.fromJson(_asMap(body['user']));

      return AuthSession(
        accessToken: (body['token'] ?? '').toString(),
        refreshToken: (body['refreshToken'] ?? '').toString(),
        user: user,
      );
    } on DioException catch (e) {
      throw Exception(_extractError(e));
    }
  }

  Future<AuthUser> getProfile({required String accessToken}) async {
    try {
      final response = await _dio.get<dynamic>(
        '/auth/profile',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
      final body = _asMap(response.data);
      return AuthUser.fromJson(_asMap(body['user']));
    } on DioException catch (e) {
      throw Exception(_extractError(e));
    }
  }

  String _extractError(DioException e) {
    final body = e.response?.data;
    if (body is Map<String, dynamic>) {
      final message = (body['error'] ?? body['message'] ?? '').toString();
      if (message.isNotEmpty) return message;
    }
    return e.message ?? 'Request failed';
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((key, val) => MapEntry(key.toString(), val));
    }
    return <String, dynamic>{};
  }
}
