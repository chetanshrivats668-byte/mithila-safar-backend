# Feature: Partner Collaboration Submission & Auto-Redirect Flow

## Overview
When a collaborator submits a partner collaboration application through a specific account (Account X), and the admin approves it, the system should remember that account and automatically redirect to the collaborator dashboard on future logins through that same account.

## User Flow

### Step 1: Collaborator Submits Partner Collab Application
- Collaborator logs in with **Account X** (e.g., email: `partner@example.com`)
- Collaborator navigates to the partner collaboration submission form
- Collaborator fills out and submits the partner collaboration application
- Application is stored with the account identifier (Account X) and marked as `pending`

### Step 2: Admin Reviews & Approves
- Admin views the pending partner collaboration application
- Admin verifies the collaborator's details and documents
- Admin clicks **"Approve"** button
- Application status changes to `approved`
- Collaborator's profile is updated with partnership verification details
- Account X is flagged as a `verified_partner` or `approved_collaborator`

### Step 3: Automatic Portal Redirect on Login
- Same collaborator logs in again using **Account X**
- System detects that Account X has an `approved` partner collaboration status
- **Partner Portal URL** (e.g., `/partner-dashboard`) is replaced with **Collaborator Dashboard URL** (e.g., `/collaborator-dashboard`)
- User is automatically redirected to the collaborator dashboard instead of the default partner portal
- All partner collaboration data is displayed on the collaborator dashboard

## Technical Requirements

### Database Schema Updates
- Add `partnerCollabStatus` field to `collaborators` table (values: `pending`, `approved`, `rejected`)
- Add `submittedFrom` field to track the account ID from which the application was submitted
- Add `approvedAt` timestamp for when admin approved the collaboration
- Add `approvedBy` field to track which admin approved it

### Authentication Logic
```
IF user logs in with Account X AND Account X.partnerCollabStatus === 'approved'
  THEN redirect to `/collaborator-dashboard`
ELSE
  redirect to default portal (partner portal or home)
```

### Endpoint Changes Required
1. **POST `/api/collaborator/submit-partner-collab`**
   - Accept partner collaboration application form
   - Save application with `submittedFrom: currentAccountId`
   - Set status to `pending`

2. **POST `/api/admin/approve-partner-collab`**
   - Accept `collaboratorId` and `action` (approve/reject)
   - Update collaborator's `partnerCollabStatus`
   - If approved, set `approvedAt` and `approvedBy`

3. **Login Endpoints** (`/api/auth/login`, `/api/auth/verify-email-otp`, `/api/auth/google`)
   - After successful authentication, check if user is an approved partner
   - Return `redirectTo: '/collaborator-dashboard'` in response if applicable
   - Frontend uses this flag to redirect

### Frontend Logic (Client-Side)
```javascript
// After successful login response
const loginResponse = await fetch('/api/auth/login', {...});
const { token, user, redirectTo } = await loginResponse.json();

if (redirectTo) {
  window.location.href = redirectTo;
} else {
  // Default portal redirect
  window.location.href = '/partner-portal';
}
```

## Edge Cases

### Case 1: Multiple Accounts
- If a user has multiple email accounts, only the account used during submission (Account X) gets the auto-redirect
- Other accounts of the same person will NOT auto-redirect

### Case 2: Admin Rejects Application
- If admin rejects the application, set `partnerCollabStatus = 'rejected'`
- User can resubmit after a cooldown period (e.g., 7 days)
- No auto-redirect occurs for rejected applications

### Case 3: User Logs Out & Logs Back In
- Auto-redirect should work every time they log in with Account X
- Redirect behavior is consistent across sessions

### Case 4: Suspended or Inactive Collaborator
- If collaborator account is suspended, do NOT redirect to dashboard
- Show appropriate error/message instead

## Testing Checklist

- [ ] Collaborator can submit partner collab application
- [ ] Admin can view pending applications in admin panel
- [ ] Admin can approve applications
- [ ] After approval, user login with same account redirects to collaborator dashboard
- [ ] User login with different account does NOT redirect
- [ ] Rejected applications prevent redirect
- [ ] Redirect works across browser sessions
- [ ] Suspended collaborators are not redirected

## Files to Modify

- `controllers/collabController.js` - Add partner collab submission handler
- `controllers/verificationController.js` or new `controllers/partnerCollabController.js` - Add approval handler
- `controllers/auth/authController.js` - Add redirect logic to login/verify endpoints
- `routes/authRoutes.js` - Ensure response includes `redirectTo` field
- `middleware/auth.js` - Validate partner status on protected routes
- Database migrations - Add new columns to `collaborators` table

## Related Issues
- Linked to: Collaborator onboarding flow
- Depends on: Existing collaborator verification system
- Affects: Partner portal UI/routing logic
