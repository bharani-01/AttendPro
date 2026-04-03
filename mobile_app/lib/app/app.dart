import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/app_config.dart';
import '../features/auth/presentation/session_controller.dart';
import 'router.dart';

class AttendProApp extends ConsumerStatefulWidget {
  const AttendProApp({super.key});

  @override
  ConsumerState<AttendProApp> createState() => _AttendProAppState();
}

class _AttendProAppState extends ConsumerState<AttendProApp> {
  @override
  void initState() {
    super.initState();
    Future<void>.microtask(() {
      ref.read(sessionControllerProvider.notifier).restoreSession();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);

    const bg = Color(0xFFF4F4F4);
    const primary = Color(0xFF007BFF);
    const black = Colors.black;
    const white = Colors.white;
    const surface = Color(0xFFFFFFFF);

    return MaterialApp.router(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: ThemeData(
        colorScheme: const ColorScheme.light(
          primary: primary,
          onPrimary: white,
          secondary: primary,
          onSecondary: white,
          surface: surface,
          onSurface: black,
          error: Color(0xFFB00020),
          onError: white,
        ),
        scaffoldBackgroundColor: bg,
        appBarTheme: const AppBarTheme(
          backgroundColor: bg,
          foregroundColor: black,
          elevation: 0,
        ),
        textTheme: const TextTheme(
          headlineSmall: TextStyle(color: black, fontSize: 24, fontWeight: FontWeight.w800),
          titleLarge: TextStyle(color: black, fontSize: 20, fontWeight: FontWeight.w700),
          titleMedium: TextStyle(color: black, fontSize: 16, fontWeight: FontWeight.w700),
          titleSmall: TextStyle(color: black, fontSize: 14, fontWeight: FontWeight.w600),
          bodyLarge: TextStyle(color: black),
          bodyMedium: TextStyle(color: black),
          bodySmall: TextStyle(color: Colors.black87),
        ),
        cardTheme: CardThemeData(
          color: surface,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          margin: EdgeInsets.zero,
        ),
        chipTheme: const ChipThemeData(
          padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          shape: StadiumBorder(),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          height: 72,
          indicatorColor: Color(0x22007BFF),
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: primary,
            foregroundColor: white,
            minimumSize: const Size.fromHeight(46),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(44),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
          filled: true,
          fillColor: surface,
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        ),
      ),
    );
  }
}
