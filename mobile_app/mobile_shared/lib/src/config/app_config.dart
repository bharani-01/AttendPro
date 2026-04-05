class AppConfig {
  static const String studentAppName = 'AttendPro Student';
  static const String facultyAppName = 'Facultyapp';

  // Override with --dart-define=API_BASE_URL=https://<host>/api
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue:
        'https://anaerobiotically-nondyspeptical-kaylynn.ngrok-free.dev/api',
  );

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 45);
}
