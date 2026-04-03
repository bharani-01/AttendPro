import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/secure_store.dart';
import '../data/auth_repository.dart';
import '../domain/models/auth_session.dart';

final secureStoreProvider = Provider<SecureStore>((ref) {
  return const SecureStore();
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(secureStore: ref.read(secureStoreProvider));
});

enum SessionStatus { unknown, unauthenticated, authenticated }

class SessionState {
  const SessionState({
    required this.status,
    this.session,
    this.errorMessage,
  });

  const SessionState.unknown() : this(status: SessionStatus.unknown);
  const SessionState.unauthenticated({String? errorMessage})
      : this(status: SessionStatus.unauthenticated, errorMessage: errorMessage);
  const SessionState.authenticated(AuthSession session)
      : this(status: SessionStatus.authenticated, session: session);

  final SessionStatus status;
  final AuthSession? session;
  final String? errorMessage;
}

class SessionController extends StateNotifier<SessionState> {
  SessionController(this._authRepository) : super(const SessionState.unknown());

  final AuthRepository _authRepository;

  Future<void> restoreSession() async {
    final session = await _authRepository.restoreSession();
    if (session == null) {
      state = const SessionState.unauthenticated();
      return;
    }
    state = SessionState.authenticated(session);
  }

  Future<void> login({required String email, required String password}) async {
    try {
      state = const SessionState.unknown();
      final session = await _authRepository.login(email: email, password: password);
      state = SessionState.authenticated(session);
    } catch (e) {
      state = SessionState.unauthenticated(errorMessage: e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> logout() async {
    await _authRepository.signOut();
    state = const SessionState.unauthenticated();
  }
}

final sessionControllerProvider = StateNotifierProvider<SessionController, SessionState>((ref) {
  return SessionController(ref.read(authRepositoryProvider));
});
