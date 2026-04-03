import 'package:dio/dio.dart';

import '../../../core/config/app_config.dart';
import '../../../core/storage/secure_store.dart';
import '../domain/models/auth_session.dart';
import '../domain/models/auth_user.dart';

class AuthRepository {
  AuthRepository({required SecureStore secureStore})
      : _secureStore = secureStore,
        _dio = Dio(
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

  final SecureStore _secureStore;
  final Dio _dio;

  Future<AuthSession> login({required String email, required String password}) async {
    try {
      final response = await _dio.post<dynamic>(
        '/auth/login',
        data: {'email': email, 'password': password},
      );

      final data = _asMap(response.data);
      final token = (data['token'] ?? '').toString();
      final refreshToken = (data['refreshToken'] ?? '').toString();
      final userJson = _asMap(data['user']);

      if (token.isEmpty || refreshToken.isEmpty || userJson.isEmpty) {
        throw Exception('Invalid login response from server.');
      }

      final user = AuthUser.fromJson(userJson);
      await _persistSession(token: token, refreshToken: refreshToken, role: user.role);
      return AuthSession(accessToken: token, refreshToken: refreshToken, user: user);
    } on DioException catch (e) {
      throw Exception(_formatAuthError(e));
    }
  }

  Future<String> forgotPassword({required String email}) async {
    try {
      final response = await _dio.post<dynamic>(
        '/auth/forgot-password',
        data: {'email': email},
      );

      final data = _asMap(response.data);
      final message = (data['message'] ?? '').toString().trim();
      return message.isEmpty ? 'If this email exists, a reset link has been sent.' : message;
    } on DioException catch (e) {
      final responseMap = _asMap(e.response?.data);
      final backendMessage = (responseMap['error'] ?? responseMap['message'] ?? '').toString().trim();
      if (backendMessage.isNotEmpty) {
        throw Exception(backendMessage);
      }

      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        throw Exception('Unable to reach server. Check internet or server URL.');
      }

      throw Exception('Unable to process forgot password request.');
    }
  }

  Future<AuthUser> getProfile({required String accessToken}) async {
    try {
      final response = await _dio.get<dynamic>(
        '/auth/profile',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
      final data = _asMap(response.data);
      final userJson = _asMap(data['user']);
      if (userJson.isEmpty) {
        throw Exception('Invalid profile response from server.');
      }
      return AuthUser.fromJson(userJson);
    } on DioException catch (e) {
      final responseMap = _asMap(e.response?.data);
      final backendMessage = (responseMap['error'] ?? responseMap['message'] ?? '').toString().trim();
      if (backendMessage.isNotEmpty) {
        throw Exception(backendMessage);
      }
      throw Exception('Unable to load profile details.');
    }
  }

  Future<AuthSession?> restoreSession() async {
    final accessToken = await _secureStore.read(SecureStore.accessTokenKey);
    final refreshToken = await _secureStore.read(SecureStore.refreshTokenKey);
    if (accessToken == null || refreshToken == null) {
      return null;
    }

    try {
      final response = await _dio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      final data = _asMap(response.data);
      final newAccessToken = (data['token'] ?? '').toString();
      final newRefreshToken = (data['refreshToken'] ?? '').toString();
      final userJson = _asMap(data['user']);

      if (newAccessToken.isEmpty || newRefreshToken.isEmpty || userJson.isEmpty) {
        await signOut();
        return null;
      }

      final user = AuthUser.fromJson(userJson);
      await _persistSession(token: newAccessToken, refreshToken: newRefreshToken, role: user.role);
      return AuthSession(accessToken: newAccessToken, refreshToken: newRefreshToken, user: user);
    } on DioException {
      await signOut();
      return null;
    }
  }

  Future<void> signOut() async {
    final accessToken = await _secureStore.read(SecureStore.accessTokenKey);
    final refreshToken = await _secureStore.read(SecureStore.refreshTokenKey);

    if (accessToken != null) {
      try {
        await _dio.post<dynamic>(
          '/auth/logout',
          data: {'refreshToken': refreshToken},
          options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
        );
      } catch (_) {
        // Best-effort logout call.
      }
    }

    await _secureStore.clear();
  }

  Future<void> _persistSession({
    required String token,
    required String refreshToken,
    required String role,
  }) async {
    await _secureStore.write(SecureStore.accessTokenKey, token);
    await _secureStore.write(SecureStore.refreshTokenKey, refreshToken);
    await _secureStore.write(SecureStore.userRoleKey, role);
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    return <String, dynamic>{};
  }

  String _formatAuthError(DioException error) {
    final statusCode = error.response?.statusCode;
    final responseMap = _asMap(error.response?.data);
    final backendMessage = (responseMap['error'] ?? responseMap['message'] ?? '').toString().trim();

    if (backendMessage.isNotEmpty) {
      return backendMessage;
    }

    if (statusCode == 401) {
      return 'Invalid email or password.';
    }
    if (statusCode == 403) {
      return 'Your account is blocked. Contact admin.';
    }
    if (statusCode == 423) {
      return 'Your account is temporarily locked. Try again later.';
    }
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return 'Unable to reach server. Check internet or server URL.';
    }

    return 'Login failed. Please try again.';
  }
}
