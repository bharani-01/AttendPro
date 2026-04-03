import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/session_controller.dart';
import '../features/dashboard/presentation/admin_home_screen.dart';
import '../features/dashboard/presentation/faculty_home_screen.dart';
import '../features/dashboard/presentation/student_home_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/splash/presentation/splash_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionControllerProvider);

  return GoRouter(
    initialLocation: '/splash',
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminHomeScreen(),
      ),
      GoRoute(
        path: '/faculty',
        builder: (context, state) => const FacultyHomeScreen(),
      ),
      GoRoute(
        path: '/student',
        builder: (context, state) => const StudentHomeScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
    ],
    redirect: (context, state) {
      final isAuthRoute =
          state.matchedLocation == '/login' || state.matchedLocation == '/forgot-password';
      final isSplash = state.matchedLocation == '/splash';

      switch (session.status) {
        case SessionStatus.unknown:
          return isSplash ? null : '/splash';
        case SessionStatus.unauthenticated:
          return isAuthRoute ? null : '/login';
        case SessionStatus.authenticated:
          if (isSplash || isAuthRoute) {
            final role = session.session?.user.role.toLowerCase();
            if (role == 'admin') return '/admin';
            if (role == 'faculty') return '/faculty';
            return '/student';
          }
          return null;
      }
    },
  );
});
