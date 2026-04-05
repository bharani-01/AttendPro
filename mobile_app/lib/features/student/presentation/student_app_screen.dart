import 'dart:convert';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_config.dart';
import '../../auth/presentation/session_controller.dart';
import '../domain/student_models.dart';
import 'tabs/student_announcements_tab.dart';
import 'tabs/student_attendance_tab.dart';
import 'tabs/student_overview_tab.dart';
import 'tabs/student_timetable_tab.dart';
import 'student_providers.dart';
import 'ui/student_ui_kit.dart';

class StudentAppScreen extends ConsumerStatefulWidget {
  const StudentAppScreen({super.key});

  @override
  ConsumerState<StudentAppScreen> createState() => _StudentAppScreenState();
}

class _StudentAppScreenState extends ConsumerState<StudentAppScreen> {
  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final GlobalKey<_QuickQrCheckinCardState> _quickQrCardKey =
      GlobalKey<_QuickQrCheckinCardState>();

  io.Socket? _notificationSocket;
  bool _notificationReady = false;
  bool _refreshingAll = false;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _initNotificationsAndRealtime();
  }

  Future<void> _initNotificationsAndRealtime() async {
    final androidSettings = const AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );
    final initSettings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(initSettings);

    final androidPlugin = _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await androidPlugin?.requestNotificationsPermission();

    _notificationReady = true;
    _connectNotificationSocket();
  }

  void _connectNotificationSocket() {
    final token = ref.read(studentAccessTokenProvider);
    final currentUserId =
        ref.read(sessionControllerProvider).session?.user.id ?? '';

    if (token == null || token.isEmpty || currentUserId.isEmpty) return;

    final apiUri = Uri.parse(AppConfig.apiBaseUrl);
    final socketBase =
        '${apiUri.scheme}://${apiUri.host}${apiUri.hasPort ? ':${apiUri.port}' : ''}';

    final socket = io.io(
      socketBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': 'Bearer $token'})
          .disableAutoConnect()
          .enableForceNew()
          .build(),
    );

    socket.on('message:new', (data) {
      if (!mounted) return;

      final payload = data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
      final message = payload['message'] is Map
          ? Map<String, dynamic>.from(payload['message'] as Map)
          : <String, dynamic>{};
      final sender = message['sender'] is Map
          ? Map<String, dynamic>.from(message['sender'] as Map)
          : <String, dynamic>{};

      final senderId = (sender['_id'] ?? '').toString();
      if (senderId.isEmpty || senderId == currentUserId) {
        return;
      }

      final senderName = (sender['name'] ?? 'New message').toString();
      final content = (message['content'] ?? '').toString();
      _showIncomingMessageNotification(senderName, content);

      ref.invalidate(studentConversationsProvider);
    });

    socket.connect();
    _notificationSocket = socket;
  }

  Future<void> _showIncomingMessageNotification(
    String senderName,
    String content,
  ) async {
    if (!_notificationReady) return;

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'messages_channel',
        'Messages',
        channelDescription: 'Incoming chat message notifications',
        importance: Importance.high,
        priority: Priority.high,
      ),
    );

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      'New message',
      content.isEmpty ? senderName : '$senderName: $content',
      details,
    );
  }

  @override
  void dispose() {
    _notificationSocket?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionControllerProvider).session?.user;

    final pages = <Widget>[
      StudentOverviewTab(
        quickQrWidget: _QuickQrCheckinCard(key: _quickQrCardKey),
        onQuickScanQr: () {
          _quickQrCardKey.currentState?.startScanFromShortcut();
        },
        onOpenTab: (tabIndex) {
          setState(() => _index = tabIndex);
        },
      ),
      const StudentAttendanceTab(),
      const StudentTimetableTab(),
      const StudentAnnouncementsTab(),
      const _MessagesTab(),
      const _LeaveTab(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text('Student | ${user?.name ?? ''}'),
        actions: [
          IconButton(
            tooltip: 'Refresh all',
            onPressed: _refreshingAll ? null : _refreshAll,
            icon: _refreshingAll
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Profile',
            onPressed: () => context.push('/profile'),
            icon: const Icon(Icons.person_outline),
          ),
          IconButton(
            tooltip: 'Logout',
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        child: KeyedSubtree(key: ValueKey<int>(_index), child: pages[_index]),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.analytics_outlined),
            selectedIcon: Icon(Icons.analytics),
            label: 'Attendance',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Timetable',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign),
            label: 'Notices',
          ),
          NavigationDestination(
            icon: Icon(Icons.forum_outlined),
            selectedIcon: Icon(Icons.forum),
            label: 'Messages',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Leave',
          ),
        ],
      ),
    );
  }

  Future<void> _refreshAll() async {
    if (_refreshingAll) return;
    setState(() => _refreshingAll = true);

    Future<void> safe(Future<dynamic> future) async {
      try {
        await future;
      } catch (_) {
        // Keep refreshing other sections even if one endpoint fails.
      }
    }

    await Future.wait([
      safe(ref.refresh(studentProfileProvider.future)),
      safe(ref.refresh(studentAttendanceSummaryProvider.future)),
      safe(ref.refresh(studentAttendanceRecordsProvider.future)),
      safe(ref.refresh(studentFilteredAttendanceSummaryProvider.future)),
      safe(ref.refresh(studentFilteredAttendanceRecordsProvider.future)),
      safe(ref.refresh(studentTodayScheduleProvider.future)),
      safe(ref.refresh(studentAnnouncementsProvider.future)),
      safe(ref.refresh(studentMessagableUsersProvider.future)),
      safe(ref.refresh(studentConversationsProvider.future)),
      safe(ref.refresh(studentLeaveRequestsProvider.future)),
    ]);

    if (mounted) {
      setState(() => _refreshingAll = false);
    }
  }
}

class _LeaveTab extends ConsumerStatefulWidget {
  const _LeaveTab();

  @override
  ConsumerState<_LeaveTab> createState() => _LeaveTabState();
}

class _MessagesTab extends ConsumerStatefulWidget {
  const _MessagesTab();

  @override
  ConsumerState<_MessagesTab> createState() => _MessagesTabState();
}

class _MessagesTabState extends ConsumerState<_MessagesTab> {
  String _contactSearch = '';

  @override
  Widget build(BuildContext context) {
    final conversationsAsync = ref.watch(studentConversationsProvider);

    return StudentTabContainer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: () => _showNewConversationSheet(context),
              icon: const Icon(Icons.add_comment_outlined),
              label: const Text('New Conversation'),
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Recent Conversations',
            child: conversationsAsync.when(
              data: (conversations) {
                if (conversations.isEmpty) {
                  return const Text('No conversations yet');
                }

                return Column(
                  children: conversations
                      .map((c) {
                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(c.displayName),
                          subtitle: Text(
                            c.lastMessage.isEmpty
                                ? 'No messages yet'
                                : c.lastMessage,
                          ),
                          onTap: () {
                            if (c.otherParticipantId.isEmpty) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Unable to open this conversation. Start from contacts once.',
                                  ),
                                  backgroundColor: Colors.red,
                                ),
                              );
                              return;
                            }
                            _openChat(
                              context,
                              c.otherParticipantId,
                              c.displayName,
                            );
                          },
                          trailing: c.unreadCount > 0
                              ? CircleAvatar(
                                  radius: 12,
                                  child: Text(
                                    c.unreadCount.toString(),
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                )
                              : null,
                        );
                      })
                      .toList(growable: false),
                );
              },
              loading: () => const _Loading(),
              error: (e, _) => _ErrorText(message: e.toString()),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showNewConversationSheet(BuildContext context) async {
    _contactSearch = '';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: 16 + MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: SizedBox(
            height: MediaQuery.of(sheetContext).size.height * 0.72,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Start New Conversation',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'Search by name or email',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (value) {
                    setState(() => _contactSearch = value.trim().toLowerCase());
                  },
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: Consumer(
                    builder: (context, ref, _) {
                      final usersAsync = ref.watch(
                        studentMessagableUsersProvider,
                      );
                      return usersAsync.when(
                        data: (users) {
                          final filtered = users
                              .where((u) {
                                if (_contactSearch.isEmpty) return true;
                                return u.name.toLowerCase().contains(
                                      _contactSearch,
                                    ) ||
                                    u.email.toLowerCase().contains(
                                      _contactSearch,
                                    ) ||
                                    u.role.toLowerCase().contains(
                                      _contactSearch,
                                    );
                              })
                              .toList(growable: false);

                          if (filtered.isEmpty) {
                            return const Center(child: Text('No users found'));
                          }

                          return ListView.separated(
                            itemCount: filtered.length,
                            separatorBuilder: (_, _) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final user = filtered[index];
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(user.name),
                                subtitle: Text('${user.role} | ${user.email}'),
                                trailing: const Icon(Icons.chat_bubble_outline),
                                onTap: () async {
                                  Navigator.of(sheetContext).pop();
                                  await _openChat(context, user.id, user.name);
                                },
                              );
                            },
                          );
                        },
                        loading: () => const _Loading(),
                        error: (e, _) => _ErrorText(message: e.toString()),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _openChat(
    BuildContext context,
    String receiverId,
    String receiverName,
  ) async {
    final token = ref.read(studentAccessTokenProvider);
    if (token == null || token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Session expired. Please login again.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      final conversationId = await ref
          .read(studentRepositoryProvider)
          .getOrCreateConversation(accessToken: token, receiverId: receiverId);

      if (!context.mounted) return;

      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (ctx) => _ChatPage(
            conversationId: conversationId,
            receiverId: receiverId,
            receiverName: receiverName,
          ),
        ),
      );

      ref.invalidate(studentConversationsProvider);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}

class _ChatPage extends ConsumerStatefulWidget {
  const _ChatPage({
    required this.conversationId,
    required this.receiverId,
    required this.receiverName,
  });

  final String conversationId;
  final String receiverId;
  final String receiverName;

  @override
  ConsumerState<_ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends ConsumerState<_ChatPage> {
  final _messageController = TextEditingController();
  final _messagesScrollController = ScrollController();
  io.Socket? _socket;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _connectRealtime();
  }

  void _connectRealtime() {
    final token = ref.read(studentAccessTokenProvider);
    if (token == null || token.isEmpty) return;

    final apiUri = Uri.parse(AppConfig.apiBaseUrl);
    final socketBase =
        '${apiUri.scheme}://${apiUri.host}${apiUri.hasPort ? ':${apiUri.port}' : ''}';

    final socket = io.io(
      socketBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': 'Bearer $token'})
          .disableAutoConnect()
          .enableForceNew()
          .build(),
    );

    socket.onConnect((_) {
      if (!mounted) return;
      ref.invalidate(studentMessagesProvider(widget.conversationId));
      ref.invalidate(studentConversationsProvider);
    });

    socket.on('message:new', (data) {
      if (!mounted) return;

      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
      final convoId = (map['conversationId'] ?? '').toString();

      if (convoId == widget.conversationId) {
        ref.invalidate(studentMessagesProvider(widget.conversationId));
      }
      ref.invalidate(studentConversationsProvider);
    });

    socket.on('message:read', (data) {
      if (!mounted) return;

      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
      final convoId = (map['conversationId'] ?? '').toString();
      if (convoId == widget.conversationId) {
        ref.invalidate(studentMessagesProvider(widget.conversationId));
      }
      ref.invalidate(studentConversationsProvider);
    });

    socket.connect();
    _socket = socket;
  }

  @override
  void dispose() {
    _socket?.dispose();
    _messageController.dispose();
    _messagesScrollController.dispose();
    super.dispose();
  }

  void _scrollToLatestMessage() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_messagesScrollController.hasClients) return;
      _messagesScrollController.animateTo(
        _messagesScrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final asyncMessages = ref.watch(
      studentMessagesProvider(widget.conversationId),
    );
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    final currentUserId =
        ref.watch(sessionControllerProvider).session?.user.id ?? '';

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.receiverName),
        actions: [
          IconButton(
            onPressed: () =>
                ref.invalidate(studentMessagesProvider(widget.conversationId)),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      resizeToAvoidBottomInset: false,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Expanded(
              child: asyncMessages.when(
                data: (messages) {
                  if (messages.isEmpty) {
                    return const Center(child: Text('No messages yet'));
                  }

                  _scrollToLatestMessage();

                  return ListView.builder(
                    controller: _messagesScrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      final m = messages[index];
                      final isMine = m.senderId == currentUserId;
                      return Align(
                        alignment: isMine
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: isMine
                                ? Colors.blue.shade100
                                : Colors.blueGrey.shade50,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Column(
                            crossAxisAlignment: isMine
                                ? CrossAxisAlignment.end
                                : CrossAxisAlignment.start,
                            children: [
                              Text(
                                m.senderName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(m.content),
                              const SizedBox(height: 4),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    m.createdAt == null
                                        ? '--:--'
                                        : DateFormat(
                                            'hh:mm a',
                                          ).format(m.createdAt!),
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey.shade700,
                                    ),
                                  ),
                                  if (isMine) ...[
                                    const SizedBox(width: 4),
                                    Icon(
                                      m.isRead ? Icons.done_all : Icons.check,
                                      size: 15,
                                      color: m.isRead
                                          ? Colors.blue
                                          : Colors.grey,
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const _Loading(),
                error: (e, _) => _ErrorText(message: e.toString()),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          curve: Curves.easeOut,
          padding: EdgeInsets.fromLTRB(
            10,
            10,
            10,
            keyboardInset > 0 ? keyboardInset : 10,
          ),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: Colors.grey.shade300)),
            color: Theme.of(context).scaffoldBackgroundColor,
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _messageController,
                  enabled: !_sending,
                  minLines: 1,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    hintText: 'Type message...',
                  ),
                  onSubmitted: (_) {
                    if (!_sending) {
                      _send();
                    }
                  },
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _sending ? null : _send,
                child: _sending
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _send() async {
    final content = _messageController.text.trim();
    if (content.isEmpty) return;

    final token = ref.read(studentAccessTokenProvider);
    if (token == null || token.isEmpty) return;

    setState(() => _sending = true);
    try {
      await ref
          .read(studentRepositoryProvider)
          .sendMessage(
            accessToken: token,
            conversationId: widget.conversationId,
            receiverId: widget.receiverId,
            content: content,
          );
      _messageController.clear();
      ref.invalidate(studentMessagesProvider(widget.conversationId));
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }
}

class _LeaveTabState extends ConsumerState<_LeaveTab> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  DateTime _selectedDate = DateTime.now();
  int _period = 1;
  String? _subjectId;
  bool _saving = false;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(studentProfileProvider);
    final classSubjectsAsync = ref.watch(studentClassSubjectsProvider);
    final summaryAsync = ref.watch(studentAttendanceSummaryProvider);
    final leavesAsync = ref.watch(studentLeaveRequestsProvider);

    return StudentTabContainer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionCard(
            title: 'Request Leave',
            child: profileAsync.when(
              data: (profile) {
                final subjectOptions = _buildLeaveSubjects(
                  profile: profile,
                  classSubjects: classSubjectsAsync.valueOrNull,
                  summary: summaryAsync.valueOrNull,
                );

                if (subjectOptions.isNotEmpty) {
                  final containsCurrent =
                      _subjectId != null &&
                      subjectOptions.any((s) => s.id == _subjectId);
                  if (!containsCurrent) {
                    _subjectId = subjectOptions.first.id;
                  }
                } else {
                  _subjectId = null;
                }

                return Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _subjectId,
                        decoration: InputDecoration(
                          labelText: 'Subject',
                          helperText: subjectOptions.isEmpty
                              ? 'No subjects available. Attend at least one class or contact faculty/admin.'
                              : null,
                        ),
                        items: subjectOptions
                            .map(
                              (s) => DropdownMenuItem(
                                value: s.id,
                                child: Text(
                                  '${s.subjectName} (${s.subjectCode})',
                                ),
                              ),
                            )
                            .toList(growable: false),
                        onChanged: subjectOptions.isEmpty
                            ? null
                            : (v) => setState(() => _subjectId = v),
                        validator: (value) => value == null || value.isEmpty
                            ? 'Subject is required'
                            : null,
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () async {
                                final picked = await showDatePicker(
                                  context: context,
                                  initialDate: _selectedDate,
                                  firstDate: DateTime.now().subtract(
                                    const Duration(days: 1),
                                  ),
                                  lastDate: DateTime.now().add(
                                    const Duration(days: 365),
                                  ),
                                );
                                if (picked != null) {
                                  setState(() => _selectedDate = picked);
                                }
                              },
                              icon: const Icon(Icons.date_range),
                              label: Text(
                                DateFormat('dd MMM yyyy').format(_selectedDate),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: DropdownButtonFormField<int>(
                              initialValue: _period,
                              decoration: const InputDecoration(
                                labelText: 'Period',
                              ),
                              items: List.generate(
                                7,
                                (i) => DropdownMenuItem(
                                  value: i + 1,
                                  child: Text('Period ${i + 1}'),
                                ),
                              ),
                              onChanged: (v) =>
                                  setState(() => _period = v ?? 1),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _reasonController,
                        maxLines: 3,
                        decoration: const InputDecoration(labelText: 'Reason'),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Reason is required';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _saving || subjectOptions.isEmpty
                            ? null
                            : () => _submitLeaveRequest(profile.classId),
                        child: Text(
                          _saving ? 'Submitting...' : 'Submit Leave Request',
                        ),
                      ),
                    ],
                  ),
                );
              },
              loading: () => const _Loading(),
              error: (e, _) => _ErrorText(message: e.toString()),
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'My Leave Requests',
            child: leavesAsync.when(
              data: (items) {
                if (items.isEmpty) {
                  return const Text('No leave requests yet');
                }
                return Column(
                  children: items
                      .map((item) {
                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            '${item.subjectName} • Period ${item.period}',
                          ),
                          subtitle: Text(
                            '${_dateOrDash(item.date)}\n${item.reason}${item.reviewComment.isEmpty ? '' : '\nComment: ${item.reviewComment}'}',
                          ),
                          isThreeLine: true,
                          trailing: _StatusChip(status: item.status),
                        );
                      })
                      .toList(growable: false),
                );
              },
              loading: () => const _Loading(),
              error: (e, _) => _ErrorText(message: e.toString()),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submitLeaveRequest(String classId) async {
    if (!_formKey.currentState!.validate()) return;
    if (_subjectId == null || _subjectId!.isEmpty) return;
    if (classId.isEmpty) {
      _showMessage('Your class is not assigned. Contact admin.', isError: true);
      return;
    }

    final token = ref.read(studentAccessTokenProvider);
    if (token == null || token.isEmpty) {
      _showMessage('Session expired. Please login again.', isError: true);
      return;
    }

    setState(() => _saving = true);
    try {
      await ref
          .read(studentRepositoryProvider)
          .submitLeaveRequest(
            accessToken: token,
            classId: classId,
            subjectId: _subjectId!,
            date: _selectedDate,
            period: _period,
            reason: _reasonController.text.trim(),
          );
      _reasonController.clear();
      ref.invalidate(studentLeaveRequestsProvider);
      _showMessage('Leave request submitted successfully.');
    } catch (e) {
      _showMessage(e.toString().replaceFirst('Exception: ', ''), isError: true);
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  void _showMessage(String text, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: isError ? Colors.red : null,
      ),
    );
  }

  List<StudentSubject> _buildLeaveSubjects({
    required StudentProfile profile,
    required List<StudentSubject>? classSubjects,
    required AttendanceSummaryBundle? summary,
  }) {
    final map = <String, StudentSubject>{};

    for (final s in profile.subjects) {
      if (s.id.isNotEmpty) {
        map[s.id] = s;
      }
    }

    final classItems = classSubjects ?? const <StudentSubject>[];
    for (final s in classItems) {
      if (s.id.isNotEmpty && !map.containsKey(s.id)) {
        map[s.id] = s;
      }
    }

    final summaryItems =
        summary?.subjectSummary ?? const <SubjectAttendanceSummary>[];
    for (final item in summaryItems) {
      final id = item.subjectId.trim();
      if (id.isEmpty || map.containsKey(id)) {
        continue;
      }
      map[id] = StudentSubject(
        id: id,
        subjectName: item.subjectName,
        subjectCode: item.subjectCode,
      );
    }

    return map.values.toList(growable: false);
  }
}

class _QuickQrCheckinCard extends ConsumerStatefulWidget {
  const _QuickQrCheckinCard({super.key});

  @override
  ConsumerState<_QuickQrCheckinCard> createState() =>
      _QuickQrCheckinCardState();
}

class _QuickQrCheckinCardState extends ConsumerState<_QuickQrCheckinCard> {
  bool _checking = false;

  Future<void> startScanFromShortcut() async {
    if (_checking) return;
    await _scanAndCheckIn();
  }

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      title: 'Quick QR Check-in',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Scan the faculty QR code. Attendance will be marked instantly.',
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: _checking ? null : _scanAndCheckIn,
            icon: const Icon(Icons.qr_code_scanner),
            label: Text(
              _checking ? 'Checking in...' : 'Scan QR and Mark Present',
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _checkIn({
    required String sessionId,
    required String qrToken,
  }) async {
    final token = ref.read(studentAccessTokenProvider);
    if (token == null || token.isEmpty) {
      _message('Session expired. Please login again.', isError: true);
      return;
    }

    setState(() => _checking = true);
    try {
      final result = await ref
          .read(studentRepositoryProvider)
          .checkInWithQrSession(
            accessToken: token,
            sessionId: sessionId,
            token: qrToken,
          );
      _message(result);
      ref.invalidate(studentAttendanceSummaryProvider);
      ref.invalidate(studentAttendanceRecordsProvider);
    } catch (e) {
      _message(e.toString().replaceFirst('Exception: ', ''), isError: true);
    } finally {
      if (mounted) {
        setState(() => _checking = false);
      }
    }
  }

  void _message(String text, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: isError ? Colors.red : null,
      ),
    );
  }

  Future<void> _scanAndCheckIn() async {
    final payload = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _QrScannerSheet(),
    );

    if (!mounted || payload == null || payload.trim().isEmpty) {
      return;
    }

    final parsed = _parseQrPayload(payload.trim());
    if (parsed == null) {
      _message('Scanned QR format is not supported.', isError: true);
      return;
    }

    await _checkIn(sessionId: parsed.sessionId, qrToken: parsed.token);
  }

  _QrScanResult? _parseQrPayload(String raw) {
    // Expected format from backend QR generate endpoint.
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        final sessionId = (decoded['sessionId'] ?? '').toString();
        final token = (decoded['token'] ?? decoded['qrToken'] ?? '').toString();
        if (sessionId.isNotEmpty) {
          return _QrScanResult(sessionId: sessionId, token: token);
        }
      }
    } catch (_) {
      // Fall through to URL/plain text parsing.
    }

    final uri = Uri.tryParse(raw);
    if (uri != null && uri.queryParameters.isNotEmpty) {
      final sessionId =
          (uri.queryParameters['session'] ??
                  uri.queryParameters['sessionId'] ??
                  '')
              .trim();
      final token =
          (uri.queryParameters['token'] ?? uri.queryParameters['qrToken'] ?? '')
              .trim();
      if (sessionId.isNotEmpty) {
        return _QrScanResult(sessionId: sessionId, token: token);
      }
    }

    // Support quick copy formats like "sessionId:xxx token:yyy".
    final sessionMatch = RegExp(
      r'(sessionId|session)\s*[:=]\s*([A-Za-z0-9_-]+)',
      caseSensitive: false,
    ).firstMatch(raw);
    final tokenMatch = RegExp(
      r'(qrToken|token)\s*[:=]\s*([A-Za-z0-9_-]+)',
      caseSensitive: false,
    ).firstMatch(raw);
    if (sessionMatch != null) {
      return _QrScanResult(
        sessionId: sessionMatch.group(2) ?? '',
        token: tokenMatch?.group(2) ?? '',
      );
    }

    return null;
  }
}

class _QrScanResult {
  const _QrScanResult({required this.sessionId, required this.token});

  final String sessionId;
  final String token;
}

class _QrScannerSheet extends StatefulWidget {
  const _QrScannerSheet();

  @override
  State<_QrScannerSheet> createState() => _QrScannerSheetState();
}

class _QrScannerSheetState extends State<_QrScannerSheet> {
  bool _handled = false;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.78,
        child: Column(
          children: [
            const ListTile(
              title: Text('Scan QR Code'),
              subtitle: Text('Align the code inside the frame'),
            ),
            const Divider(height: 1),
            Expanded(
              child: MobileScanner(
                fit: BoxFit.cover,
                onDetect: (capture) {
                  if (_handled) return;
                  final value = capture.barcodes.first.rawValue;
                  if (value == null || value.trim().isEmpty) return;
                  _handled = true;
                  Navigator.of(context).pop(value.trim());
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return StudentSectionCard(title: title, child: child);
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    return StudentStatusChip(status: status);
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const StudentLoadingState();
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return StudentErrorState(message: message);
  }
}

String _dateOrDash(DateTime? date) {
  return studentDateOrDash(date);
}
