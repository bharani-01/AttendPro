# AttendPro

AttendPro is a full-stack attendance management platform with:
- Node.js + Express backend
- MongoDB data layer
- Web dashboard (Admin/Faculty/Student)
- Flutter mobile app with role-based workflows and realtime messaging

It supports attendance marking (manual and QR), timetable, announcements, leave requests, exports, analytics, RBAC, audit logs, and security controls.

## Table of Contents
- Project Summary
- Core Features
- Tech Stack
- Architecture Overview
- Repository Structure
- Authentication and Authorization
- Realtime Events (Socket.IO)
- Environment Variables
- Getting Started
- API Reference
- HTTP Status and Error Conventions
- Troubleshooting
- Future Improvements

## Project Summary
AttendPro is designed for educational institutions to manage daily operations around class attendance and communication.

### Key capabilities
- Role-based dashboards for Admin, Faculty, and Student
- Attendance workflows:
  - Faculty manual marking
  - Bulk attendance updates
  - Student QR-based check-in
- Timetable and substitution management
- Announcement publishing
- Leave request workflow
- Messaging with realtime updates
- Analytics, reports, CSV/PDF/Excel export
- Audit logs and security/admin controls

## Core Features

### Admin
- Manage users (students/faculty/admin)
- Manage classes, subjects, timetables
- Manage role/permission mapping (RBAC)
- View audit and security dashboards
- View reports and export data

### Faculty
- Mark attendance (single and bulk)
- Generate and control QR sessions for attendance
- Review class attendance history
- Manage announcements and substitutions
- Handle student leave requests

### Student
- View attendance summary and records
- QR check-in for attendance
- View timetable and announcements
- Submit leave requests
- Realtime messaging and notifications

## Tech Stack

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT authentication
- Socket.IO
- Nodemailer (email)
- Twilio (SMS)

### Frontend (Web)
- HTML/CSS/Vanilla JavaScript
- Chart.js (analytics visualizations)

### Mobile
- Flutter
- Riverpod
- GoRouter
- Dio
- socket_io_client
- mobile_scanner
- flutter_local_notifications

## Architecture Overview

### Backend architecture
- `server/index.js` boots HTTP + Socket.IO server
- All API routes mounted under `/api`
- Non-public routes are guarded by global auth middleware
- Feature modules are organized by `routes/`, `controllers/`, `models/`, `services/`

### Client architecture
- Static web app served from `client/`
- API wrapper in `client/js/api.js`
- Separate role dashboards and feature scripts

### Mobile architecture
- Feature-first Flutter structure under `mobile_app/lib/features/`
- Shared app shell/router in `mobile_app/lib/app/`
- Data access through repository/provider layers

## Repository Structure

```text
attendance-app/
  client/                      # Web frontend (static)
    html/
    css/
    js/
  mobile_app/                  # Flutter mobile application
    lib/
      app/
      core/
      features/
  server/                      # Node.js backend
    config/
    controllers/
    middleware/
    models/
    routes/
    services/
  README.md
```

## Authentication and Authorization

### Auth model
- Access token (JWT) + refresh token flow
- Token revocation support (revoked token store)
- Refresh token rotation and invalidation by token version

### Public endpoints
These endpoints are intentionally public:
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api`

### Protected endpoints
All other `/api/*` routes require:
- `Authorization: Bearer <access_token>`

### Role checks
Route-level role gates are applied using middleware:
- `admin`
- `faculty`
- `student`
- mixed route guards where applicable

## Realtime Events (Socket.IO)

Socket authentication uses JWT token passed in handshake auth/header.

### Server emits
- `message:new` - new message event
- `message:read` - read status update

### Rooming model
- User-specific room: `user:<userId>`

## Environment Variables
Create `server/.env` with appropriate values.

```env
# Core
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/attendance_db

# Security / JWT
JWT_SECRET=change_this_secret
JWT_REFRESH_SECRET=change_this_refresh_secret
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# CORS (comma-separated origins)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:5500

# App URLs
BASE_URL=http://localhost:5001

# Email
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password
SENDER_EMAIL=noreply@yourdomain.com
BREVO_SMTP_KEY=optional_brevo_key

# SMS (optional)
TWILIO_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

## Getting Started

## Deploy Web App On Render (Web Only)

This deploys only the Node.js backend + static web client from this repo. Flutter/mobile apps are not deployed on Render in this setup.

### Option A: Blueprint deploy (recommended)
- Keep `render.yaml` at repo root.
- In Render, create a new Blueprint from your GitHub repository.
- Render will create one web service using `server/` as the root directory.

### Option B: Manual Web Service
- New Render Web Service -> connect this repository.
- Set Root Directory to `server`.
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/api`

### Required environment variables on Render
Set these in the Render dashboard for the web service:

```env
NODE_ENV=production
MONGODB_URI=<your mongodb connection string>
JWT_SECRET=<strong random secret>
JWT_REFRESH_SECRET=<strong random secret>

# Recommended for deployed web access and CORS
BASE_URL=https://<your-render-service>.onrender.com
CORS_ALLOWED_ORIGINS=https://<your-render-service>.onrender.com

# Optional email/sms integrations
EMAIL_USER=
EMAIL_PASS=
SENDER_EMAIL=
BREVO_SMTP_KEY=
TWILIO_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

Notes:
- Render automatically provides `PORT` and `RENDER_EXTERNAL_URL`.
- The server already serves the web client pages, so no separate static hosting is required.

## 1) Backend setup

```bash
cd server
npm install
npm run dev
```

Server defaults:
- API base: `http://localhost:5001/api`

## 2) Web app usage
Backend serves static frontend files under `client/`.

Open:
- `http://localhost:5001/login`
or
- `http://localhost:5001/`

## 3) Mobile setup

```bash
cd mobile_app
flutter pub get
flutter run
```

If backend URL differs from default mobile config, set API base URL appropriately.

## API Reference

All routes below are relative to base path: `/api`.

## Health

| Method | Endpoint | Use |
|---|---|---|
| GET | `/` | API health/info |

## Auth (`/auth`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login and receive tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout and revoke token |
| GET | `/auth/profile` | Get current user profile |
| GET | `/auth/users` | List users (admin) |
| PUT | `/auth/users/:id` | Update user (admin) |
| POST | `/auth/users/:id/reset-password-random` | Admin reset user password |
| DELETE | `/auth/users/:id` | Delete user (admin) |
| POST | `/auth/students/add` | Add a student (admin/faculty) |
| POST | `/auth/students/bulk` | Bulk add students (admin/faculty) |
| POST | `/auth/forgot-password` | Start reset-password flow |
| POST | `/auth/reset-password` | Complete reset-password flow |

## Subjects (`/subjects`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/subjects` | Create subject (admin) |
| GET | `/subjects` | List subjects |
| GET | `/subjects/:id` | Get subject details |
| PUT | `/subjects/:id` | Update subject (admin) |
| DELETE | `/subjects/:id` | Delete subject (admin) |

## Classes (`/classes`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/classes` | Create class (admin) |
| GET | `/classes` | List classes |
| GET | `/classes/:id` | Get class details |
| PUT | `/classes/:id` | Update class (admin) |
| DELETE | `/classes/:id` | Delete class (admin) |
| POST | `/classes/:id/students` | Add students to class (admin) |
| DELETE | `/classes/:id/students/:studentId` | Remove student from class (admin) |

## Timetable (`/timetable`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/timetable` | Create timetable (admin) |
| GET | `/timetable` | List timetable entries |
| GET | `/timetable/today` | Get today's timetable |
| GET | `/timetable/faculty/today` | Faculty today's schedule |
| GET | `/timetable/class/:classId/day/:day` | Class timetable by day |
| PUT | `/timetable/:id` | Update timetable (admin) |
| DELETE | `/timetable/:id` | Delete timetable (admin) |

## Attendance (`/attendance`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/attendance/mark` | Mark single attendance (faculty/admin) |
| POST | `/attendance/bulk` | Bulk mark attendance (faculty/admin) |
| GET | `/attendance` | Query attendance records |
| GET | `/attendance/student/summary/:studentId` | Student summary by ID |
| GET | `/attendance/student/summary` | Current student summary |
| GET | `/attendance/student/:studentId` | Student records by ID |
| GET | `/attendance/student` | Current student records |
| GET | `/attendance/class` | Class attendance view |
| GET | `/attendance/report` | Attendance report |
| GET | `/attendance/export` | Export attendance CSV |
| PUT | `/attendance/:id` | Update attendance status |

## Audit (`/audit`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/audit` | Full audit log (admin) |
| GET | `/audit/recent` | Recent activity (admin) |
| GET | `/audit/stats` | Audit metrics (admin) |

## Leave Requests (`/leave-requests`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/leave-requests` | Submit leave request (student) |
| GET | `/leave-requests` | List leave requests by role context |
| PUT | `/leave-requests/:id/approve` | Approve request (faculty/admin) |
| PUT | `/leave-requests/:id/reject` | Reject request (faculty/admin) |

## Analytics (`/analytics`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/analytics/summary` | Overall analytics summary |
| GET | `/analytics/by-student` | Student-wise analytics |
| GET | `/analytics/by-subject` | Subject-wise analytics |
| GET | `/analytics/trends` | Trend analytics |
| GET | `/analytics/anomalies` | Anomaly analytics (admin) |

## QR Attendance (`/qr`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/qr/generate` | Generate QR session (faculty/admin) |
| GET | `/qr/status/:sessionId` | Get QR session status |
| GET | `/qr/payload/:sessionId` | Get rotating QR payload |
| GET | `/qr/active` | List active QR sessions |
| GET | `/qr/checkin/:sessionId` | Validate check-in session (student) |
| POST | `/qr/submit` | Submit QR attendance (student) |
| POST | `/qr/end` | End QR session |

## Export (`/export`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/export/excel` | Export records as Excel/CSV |
| GET | `/export/pdf` | Export records as PDF |

## User (`/user`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/user/profile` | Get user profile |
| PUT | `/user/profile` | Update user profile |
| PUT | `/user/password` | Change password |
| PUT | `/user/dashboard-settings` | Save dashboard preferences |

## Messages (`/messages`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/messages/conversations` | Create/get conversation |
| GET | `/messages/conversations` | List conversations |
| GET | `/messages/conversations/:conversationId` | List messages in conversation |
| POST | `/messages/messages` | Send message |
| GET | `/messages/messagable-users` | List users that can be messaged |

## Announcements (`/announcements`)

| Method | Endpoint | Use |
|---|---|---|
| POST | `/announcements` | Create announcement (admin) |
| GET | `/announcements` | List announcements |
| GET | `/announcements/all` | List all announcements (admin) |
| DELETE | `/announcements/:id` | Delete announcement (admin) |

## RBAC (`/rbac`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/rbac/permissions` | List permissions |
| POST | `/rbac/permissions` | Create permission |
| GET | `/rbac/roles` | List roles |
| POST | `/rbac/roles` | Create role |
| PUT | `/rbac/roles/:id` | Update role |
| DELETE | `/rbac/roles/:id` | Delete role |

## Substitutions (`/substitutions`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/substitutions` | List substitutions |
| POST | `/substitutions` | Create substitution |
| DELETE | `/substitutions/:id` | Delete substitution |

## Settings (`/settings`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/settings/widget/:widgetName` | Get widget settings |
| POST | `/settings/widget/:widgetName` | Save widget settings |
| GET | `/settings/dashboard` | Get dashboard settings |
| POST | `/settings/dashboard` | Save dashboard settings |

## Security (`/security`)

| Method | Endpoint | Use |
|---|---|---|
| GET | `/security/attempts` | View suspicious attempts (admin) |
| GET | `/security/blocked-users` | View blocked users (admin) |
| POST | `/security/block-user` | Block user (admin) |
| POST | `/security/unblock-user` | Unblock user (admin) |

## HTTP Status and Error Conventions

Common statuses:
- `200` OK
- `201` Created
- `400` Bad request / validation issue
- `401` Unauthorized / invalid token
- `403` Forbidden / role mismatch
- `404` Not found
- `423` Temporarily locked account (auth)
- `500` Internal server error

Common error shape:

```json
{
  "error": "Human-readable message"
}
```

## Troubleshooting

### CORS errors
- Set `CORS_ALLOWED_ORIGINS` correctly for your frontend origins.

### Auth failures
- Ensure `Authorization` header is `Bearer <token>`.
- Confirm access token is not expired.
- Use `/api/auth/refresh` for renewal.

### Slow attendance responses
- Use smaller date ranges in attendance filters.
- Ensure MongoDB indexes are healthy.

### Email/SMS not sending
- Verify `EMAIL_*` and `TWILIO_*` env vars.
- Check provider-side credentials/limits.

## Future Improvements
- API versioning (`/api/v1`)
- OpenAPI/Swagger docs generation
- Automated test suites (unit + integration + e2e)
- CI/CD pipeline with lint/test/build stages
- Dockerized local/dev deployment

---

If you use this repository in production, rotate all secrets and ensure `.env` is never committed.
