import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../auth/domain/models/auth_user.dart';

class AdminRepository {
  AdminRepository()
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

  Future<List<AuthUser>> fetchUsers({
    required String accessToken,
    String? role,
  }) async {
    final response = await _dio.get<dynamic>(
      '/auth/users',
      queryParameters: role == null ? null : {'role': role},
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );

    final body = response.data;
    if (body is! Map<String, dynamic>) {
      throw Exception('Invalid response shape for users list.');
    }

    final rawUsers = body['users'];
    if (rawUsers is! List) {
      return const <AuthUser>[];
    }

    return rawUsers
        .whereType<Map<String, dynamic>>()
        .map(AuthUser.fromJson)
        .toList(growable: false);
  }
}

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  return AdminRepository();
});
