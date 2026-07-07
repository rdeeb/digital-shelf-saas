# Account Activation And Steam Linking Design

Date: 2026-07-07
Repo: `C:\Users\rdeeb\Development\virtual-shelf\saas`

## Summary

Virtual Shelf should use app-owned credentials for account creation and login, while requiring a linked Steam account before the user can activate the product, subscribe, or use any Steam-library-backed features.

This design keeps native mobile authentication simple, uses the browser only for the part that actually needs Steam OpenID, and preserves the subscription on the app account even if the user later changes their Steam account.

## Goals

- Support native app signup and login with `email + password`.
- Require Steam linking before subscription, library sync, frame generation, or normal product use.
- Use a short-lived browser handoff flow to complete Steam linking.
- Automatically log the user into the app after successful Steam linking.
- Allow Steam relink later, while clearly deleting Steam-derived library data.
- Keep subscription ownership attached to the app account, not the Steam account.

## Non-Goals

- Supporting a fully usable app account without a linked Steam account.
- Making Steam OpenID the primary login mechanism for the mobile app.
- Allowing subscription purchase before Steam linking.
- Preserving old Steam-derived library data across Steam relink.

## Chosen Approach

Use an app-owned identity model with Steam-gated activation.

The app account is created and authenticated with `email + password`. Steam is required to activate the account for product use, but Steam is not the base account credential. The browser is used only to complete the account setup flow that requires Steam OpenID.

## Account And Activation Model

### Canonical identity

- `email + password` is the canonical app credential.
- The `User` record is app-owned first.
- `steamId` is required for activation, subscription eligibility, library sync, and frame use.
- Subscription remains attached to the app account even if Steam changes later.

### Account states

The account lifecycle should be modeled with explicit activation states:

- `account_created`
- `pending_activation`
- `active`

Suggested interpretation:

- `account_created`: account exists after signup but is not ready for normal product use.
- `pending_activation`: the user has authenticated enough to continue setup, but still lacks a linked Steam account.
- `active`: Steam is linked and the account is eligible for normal login and product gating by subscription/setup state.

### Core activation rules

- A user may create an account in the app without Steam.
- No user may create a subscription if `steamId` is missing.
- No user may use library, frame, or Steam-derived product features if `steamId` is missing.
- The next required step after account creation is Steam linking.

## Login And Completion Flows

### Normal login

1. User enters `email + password` in the app.
2. If the account is already active and linked to Steam, login completes immediately.
3. The app routes the user by state:
   - subscription screen if no subscription exists
   - remaining onboarding if setup is incomplete
   - normal app entry if fully ready

### Incomplete account login

1. User enters `email + password` in the app.
2. If password authentication succeeds but the account has no `steamId`, the backend must not mint a full app session yet.
3. Instead, the backend issues a one-time completion token.
4. The app opens a browser URL carrying that token.
5. The browser resolves the pending completion session and immediately starts Steam OpenID.
6. After successful Steam callback, the backend creates the real app session and deep-links the user back into the app already logged in.

### Completion token rules

- Completion token is one-time use.
- Completion token TTL is 5 minutes.
- Token is hashed at rest.
- Expired or consumed tokens must fail safely and require the app to request a new token.

### Email-driven activation

Signup may also send an activation email. The verification link should act as a completion entrypoint, not just a passive email-verified flag.

Recommended browser flow:

1. User receives activation email.
2. User clicks the email link.
3. Browser verifies the email and starts account completion.
4. Browser immediately continues into Steam OpenID.
5. Successful Steam callback creates the real session and returns the user to the app.

This combines email verification and Steam linking into one guided browser workflow.

### Automatic login after Steam linking

After successful Steam linking:

- the backend immediately creates the real app session or mobile token set
- the browser deep-links back to the app
- the app opens already authenticated
- if there is no subscription, the app lands on the subscription screen

No extra confirmation step is required in the app after successful Steam callback.

## Steam As Product Requirement

Steam is a requirement to use the product, but it is not the base account credential.

This distinction matters:

- app identity must remain mobile-friendly and app-owned
- Steam remains mandatory because the frame and library experience depends on the Steam games library
- product activation depends on Steam linkage, not on Steam-first account creation

## Subscription Guard

Subscription must remain attached to `userId`, not `steamId`.

Backend must enforce:

- subscription creation requires `steamId`
- changing Steam does not cancel or move the subscription
- after successful login and activation, if no subscription exists, route to subscription

This must be enforced server-side, not only by UI rules.

## Steam Relink Flow

### User-facing behavior

Users may change the linked Steam account later.

This must be treated as a destructive account migration, not a casual settings toggle.

Before relink:

- require recent re-authentication
- show a destructive warning
- require explicit confirmation that the old Steam-derived library data will be deleted

### Data consequences

When Steam changes:

- subscription stays attached to the app account
- old Steam-derived library data is deleted
- the new Steam account becomes the single active Steam link
- the library is rebuilt by syncing the new account

### Deletion scope

Delete Steam-derived data tied to the old linked account, including:

- prior `PlatformAccount` row for Steam
- synced `UserGame` rows
- Steam sync runs
- cached library-derived selection/history that depends on the previous library

Keep app-owned data, including:

- user identity
- subscription and billing history
- non-library user settings
- devices, unless a device record is truly invalid without the old Steam mapping

## Backend Boundaries

### User model changes

The `User` model should support app-owned authentication and activation state separately from Steam linkage. At minimum, the system will need data for:

- email
- password hash
- email verification state
- activation/completion state
- linked `steamId`

Whether `steamId` stays directly on `User` or is fully represented through `PlatformAccount`, the effective rule remains the same: activation and subscription eligibility require a linked Steam identity.

### Completion token model

Add a dedicated one-time token model for:

- `account_activation`
- `steam_relink`

Suggested fields:

- token hash
- user id
- purpose
- expires at
- consumed at
- optional metadata for redirect or deep-link context

### Session rules

- Password login for incomplete accounts must not create a full product session.
- Completion flow may create only a pending completion context.
- Full app session is created only after successful Steam callback.
- Return deep-link token should also be short-lived and single-use.

## Error Handling

### User-visible behavior

- Wrong password behaves normally and does not reveal whether Steam is linked.
- If login succeeds but account is incomplete, the app shows a clear `Finish linking your account` state and opens the completion browser flow.
- If completion token is expired or already used, browser shows a safe failure page and offers return to the app.
- If Steam auth fails or is cancelled, the user returns to the app with a clear retry path.
- If login is successful and activation is complete but no subscription exists, the subscription screen is shown first.

### Invariants

- exactly one active Steam link per user at a time
- no subscription creation without `steamId`
- no Steam-derived product access without `steamId`
- Steam relink is atomic from the user perspective: either the new Steam account is attached and old Steam-derived data is cleared, or nothing changes

## Testing

Add coverage for:

- signup creates a pending account without full activation
- password login for a pending account returns completion-required behavior
- completion token is one-time use
- completion token expires after 5 minutes
- valid completion flow followed by Steam callback activates the account and creates the real session
- subscription endpoint rejects users without `steamId`
- active linked account logs in directly
- successful activation with no subscription lands on subscription
- Steam relink preserves subscription and app-owned account data
- Steam relink deletes prior Steam-derived library data and rebuilds from the new account
- expired or consumed tokens cannot be reused

## Rollout Notes

- Add schema support first for app-owned auth and completion tokens.
- Introduce activation-state checks in backend guards before switching all UI flows.
- Keep existing Steam-first paths temporarily only if needed for compatibility during migration.
- Converge onboarding and login onto the new app-owned identity plus Steam-gated activation flow.

## Recommendation

Implement the app-owned identity and Steam-gated activation model as the default path for both signup and incomplete-account login.

This is the cleanest fit for a mobile-first product where Steam is mandatory for product use but impractical as the primary native authentication mechanism.
