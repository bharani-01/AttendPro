import 'package:shared_preferences/shared_preferences.dart';

class SecureStore {
  const SecureStore();

  static const accessTokenKey = 'access_token';
  static const refreshTokenKey = 'refresh_token';
  static const userRoleKey = 'user_role';

  Future<void> write(String key, String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, value);
  }

  Future<String?> read(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(key);
  }

  Future<void> delete(String key) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(key);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(accessTokenKey);
    await prefs.remove(refreshTokenKey);
    await prefs.remove(userRoleKey);
  }
}
