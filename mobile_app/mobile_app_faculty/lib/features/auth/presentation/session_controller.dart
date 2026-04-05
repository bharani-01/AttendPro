import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_shared/mobile_shared.dart';

import '../data/auth_repository.dart';
import '../domain/models/auth_session.dart';
import '../domain/models/auth_user.dart';

enum SessionStatus { unknown, unauthenticated, authenticated }

class SessionState {
  const SessionState({
    required this.status,
    this.session,
    this.isLoading = false,
    this.errorMessage,
  });

  final SessionStatus status;
  final AuthSession? session;
  final bool isLoading;
  final String? errorMessage;

  SessionState copyWith({
    SessionStatus? status,
    AuthSession? session,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return SessionState(
      status: status ?? this.status,
      session: session ?? this.session,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(),
);

final sessionControllerProvider =
    StateNotifierProvider<SessionController, SessionState>((ref) {
      return SessionController(
        repository: ref.read(authRepositoryProvider),
        store: const SecureStore(),
      );
    });

class SessionController extends StateNotifier<SessionState> {
  SessionController({
    required AuthRepository repository,
    required SecureStore store,
  }) : _repository = repository,
       _store = store,
       super(const SessionState(status: SessionStatus.unknown));

  final AuthRepository _repository;
  final SecureStore _store;

  static const String _userJsonKey = 'faculty_user_json';

  Future<void> restoreSession() async {
    final token = await _store.read(SecureStore.accessTokenKey);
    final refreshToken = await _store.read(SecureStore.refreshTokenKey);
    final role = await _store.read(SecureStore.userRoleKey);
    final userJson = await _store.read(_userJsonKey);

    if (token == null ||
        token.isEmpty ||
        userJson == null ||
        userJson.isEmpty) {
      state = const SessionState(status: SessionStatus.unauthenticated);
      return;
    }

    try {
      final parsed = jsonDecode(userJson);
      if (parsed is! Map<String, dynamic>) {
        throw Exception('Invalid session data');
      }
      final user = AuthUser.fromJson(parsed);
      final userRole = user.role.toLowerCase();
      if (role?.toLowerCase() != 'faculty' || userRole != 'faculty') {
        await logout();
        return;
      }

      state = SessionState(
        status: SessionStatus.authenticated,
        session: AuthSession(
          accessToken: token,
          refreshToken: refreshToken ?? '',
          user: user,
        ),
      );
    } catch (_) {
      await logout();
    }
  }

  Future<bool> login({required String email, required String password}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final session = await _repository.login(email: email, password: password);
      if (session.user.role.toLowerCase() != 'faculty') {
        state = state.copyWith(
          isLoading: false,
          errorMessage: 'This app is for faculty accounts only.',
          status: SessionStatus.unauthenticated,
        );
        return false;
      }

      await _store.write(SecureStore.accessTokenKey, session.accessToken);
      await _store.write(SecureStore.refreshTokenKey, session.refreshToken);
      await _store.write(SecureStore.userRoleKey, session.user.role);
      await _store.write(_userJsonKey, jsonEncode(session.user.toJson()));

      state = SessionState(
        status: SessionStatus.authenticated,
        session: session,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
        status: SessionStatus.unauthenticated,
      );
      return false;
    }
  }

  Future<void> logout() async {
    await _store.clearAuth();
    await _store.delete(_userJsonKey);
    state = const SessionState(status: SessionStatus.unauthenticated);
  }
}
