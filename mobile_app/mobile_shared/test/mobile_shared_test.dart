import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_shared/mobile_shared.dart';

void main() {
  test('exports shared app config', () {
    expect(AppConfig.studentAppName, isNotEmpty);
    expect(AppConfig.facultyAppName, isNotEmpty);
    expect(AppConfig.apiBaseUrl, isNotEmpty);
  });

  test('secure store keys are available', () {
    expect(SecureStore.accessTokenKey, 'access_token');
    expect(SecureStore.refreshTokenKey, 'refresh_token');
    expect(SecureStore.userRoleKey, 'user_role');
  });
}
