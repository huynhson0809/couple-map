# Pinly Memory Spaces Design

## Problem

Pinly is currently modeled and presented as a couple-only app. The product blocks the main app until a second person joins, and much of the schema, RLS, hooks, UI copy, notifications, subscriptions, and streak logic are tied to `couple_id`.

The next product direction is broader: people should be able to save memories alone or share memories with someone else now, while leaving a clear path to support small groups later.

## Goals

- Reposition Pinly from a couple map to memory spaces for personal and shared memories.
- Let a new user choose between starting with **Bản đồ của tôi** or using Pinly with another person.
- Let solo users enter the app immediately without waiting for a second member.
- Let solo users invite another person into the current map, with clear consent that existing memories become shared.
- Keep the first UI release limited to two people per shared space.
- Design the backend around spaces and memberships, with a hard initial backend limit of five members per space.
- Preserve existing users, memories, media, subscriptions, and settings through migration.
- Gate couple-heavy features so they appear only in two-member spaces.

## Non-Goals

- Do not expose three-to-five-member groups in the first UI release.
- Do not redesign the whole map, timeline, wishlist, or pin creation experience.
- Do not move subscriptions from space-level billing to user-level billing.
- Do not remove existing memories or media during migration.
- Do not immediately delete every legacy `couple_*` name if a compatibility phase reduces risk.

## Product Model

Pinly should use **Memory Space** as the core product model.

The first UI release supports:

- **Personal space**
  - Default name: **Bản đồ của tôi** in Vietnamese and **My Map** in English.
  - Has one active member.
  - User enters the map immediately after setup.

- **Shared space**
  - Currently exposed as a two-person shared map.
  - Created by choosing to use Pinly with another person, by creating a new shared space, or by inviting someone into an existing personal space.
  - Uses an invite code for the second member.
  - Can have one active member while waiting for the invite to be accepted.

- **Backend-ready group space**
  - The schema and RPCs support up to five active members per space.
  - The first UI release does not expose adding a third member.

Map, timeline, memories, media, categories, wishlist, settings, subscriptions, and notifications belong to a space. A user can belong to multiple spaces, and the frontend works against an `activeSpaceId`.

## Onboarding

After registration and required consent, the user sees **Bạn muốn bắt đầu thế nào?**

Choices:

- **Bản đồ của tôi**
  - Creates a personal space if the user does not already have one.
  - Sets it as active.
  - Navigates directly to the map.

- **Dùng cùng người khác**
  - Opens a second step with:
    - **Tạo mã mời**: creates a shared space and shows the invite code.
    - **Nhập mã mời**: joins an existing shared space by code.

Unlike the current pairing flow, creating a shared space should not trap the creator on a waiting screen. The creator can enter the map immediately and add memories while waiting for the second member. When the invite is accepted, existing memories in that shared space are visible to both members.

## Solo To Shared Flow

From a personal space, Settings includes **Mời người khác vào bản đồ này**.

Flow:

1. User taps the invite action.
2. The app shows a confirmation explaining that the invited person will see all existing memories in this map.
3. If confirmed, the app creates or reveals the invite code for the current space.
4. The space changes from `personal` to `shared` and remains usable while waiting for the invite to be accepted.
5. When another user joins, the space becomes a two-member shared space.
6. Duo-only features become available.

This flow does not move memories between spaces. The existing personal space itself becomes shared, which keeps the data model simple and makes the privacy boundary explicit at the moment of invite.

## Multi-Space UX

The first release should include a simple space switcher because the backend supports multiple spaces.

Minimum UI:

- Show the active space name in a header or Settings entry.
- Let the user switch between spaces they belong to.
- Let the user create a new space with a simple **Tạo bản đồ mới** action.
- Let the user create a shared space invite from a space that has one member.

The first release should not expose adding a third member, role customization, or advanced space organization. If a space already has two active members, the UI should say the current version supports up to two people in a shared map.

## Data Model

Add a space-based model while keeping a compatibility path for existing `couple_id` usage.

### `spaces`

Suggested columns:

- `id uuid primary key`
- `name text not null`
- `type text not null check (type in ('personal', 'shared', 'group'))`
- `invite_code text unique`
- `owner_id uuid not null references public.users(id)`
- `max_members int not null default 5`
- `background_image_url text`
- `started_on date`
- `plan text not null default 'free'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`started_on` replaces the product-facing idea of anniversary for a neutral space model. Existing `anniversary_date` can migrate into it.

### `space_members`

Suggested columns:

- `space_id uuid not null references public.spaces(id) on delete cascade`
- `user_id uuid not null references public.users(id) on delete cascade`
- `role text not null check (role in ('owner', 'member'))`
- `status text not null check (status in ('active', 'removed'))`
- `joined_at timestamptz not null default now()`
- primary key `(space_id, user_id)`

Invites can remain code-based on `spaces` for the first release. A separate invite table can be added later if expiring, per-email, or per-role invitations are needed.

### Existing Tables

Tables that currently reference `couple_id` should gain `space_id` and eventually read/write through it:

- `pins`
- `pin_categories`
- `collections`
- `bucket_list`
- `custom_categories`
- `notifications`
- `subscriptions`
- `couple_streaks` and `couple_streak_days`
- reminder logs and related streak/nudge tables

The migration can keep `couple_id` during a compatibility phase. New frontend code should use `spaceId` naming even if adapters still map to legacy fields internally.

## Permissions And RPCs

Replace couple membership checks with space membership checks.

Core helpers:

- `is_space_member(target_space_id uuid) returns boolean`
- `is_space_owner(target_space_id uuid) returns boolean`
- `get_my_space_ids() returns setof uuid`
- `get_space_context_for_current_user(active_space_id uuid default null) returns jsonb`

Core RPCs:

- `create_personal_space_for_current_user()`
- `create_shared_space_for_current_user(name text default null)`
- `create_or_get_space_invite(space_id uuid)`
- `join_space_by_invite(code text)`
- `promote_personal_space_to_shared(space_id uuid)`
- `set_active_space_for_current_user(space_id uuid)`
- `rename_space(space_id uuid, name text)`
- `leave_space(space_id uuid)`
- `delete_space(space_id uuid, confirm_text text)`

`join_space_by_invite` must enforce both:

- Backend hard limit: active member count must be less than `spaces.max_members`, initially five.
- UI release limit: frontend should not expose joining a third member while the product is limited to two-person shared spaces.

RLS should allow reads/writes only when `is_space_member(space_id)` is true. Owner-only operations, such as deleting a space or changing member management settings, should require `is_space_owner(space_id)`.

## Feature Gates

Centralize space capability logic so UI and background jobs are consistent.

Suggested capabilities:

- `canUseDuoFeatures = activeMemberCount === 2`
- `canInviteInCurrentUi = activeMemberCount < 2`
- `backendCanAcceptMember = activeMemberCount < maxMembers`
- `canDeleteSpace = currentUserRole === 'owner'`
- `canLeaveSpace = activeMemberCount > 1 || currentUserRole !== 'owner'`

Feature visibility:

- Personal and shared spaces: map, timeline, memories, media, categories, wishlist, settings.
- Two-member shared spaces only: streak, nudge, days together, started date prompts, partner-style notification copy.
- One-member spaces: no partner notifications, no nudge, no streak reminder.
- Three-to-five-member spaces: not exposed in the first UI release. If reached through backend/admin data, duo-only features remain disabled until a group-specific design exists.

## Naming And Copy

General app copy should stop using couple-specific language.

Replace:

- `couple` -> `space`, `map`, or `shared map`
- `partner` / `người ấy` -> `member`, `thành viên`, or the member's display name
- `Pair with your partner` -> setup copy around starting a personal map or using Pinly with someone else
- `Anniversary` -> `Started date` or a Vietnamese equivalent such as `Ngày bắt đầu`

The landing page, README, legal content, notifications, Settings, onboarding, and empty states should all reflect the broader positioning.

## Existing User Migration

Migration rules:

- Existing couple with `user_a` and `user_b`
  - Create a `shared` space.
  - Add both users to `space_members`.
  - Preserve invite code, background image, anniversary date as `started_on`, plan, subscription, pins, media, wishlist, categories, notifications, and streak data.

- Existing couple with only `user_a`
  - Create a `shared` space owned by `user_a` with one active member.
  - Let the user enter the map immediately.
  - Preserve the invite code so their existing invite path still works.

- Existing users without a couple
  - Create a personal space during first app load or onboarding.

The old one-couple account lock should be retired. A user can belong to multiple spaces.

## Architecture

Frontend:

- Introduce `Space`, `SpaceMember`, `SpaceContext`, `useSpaces`, and `useActiveSpace`.
- Keep a temporary adapter where needed so existing components can move from `coupleId` to `spaceId` incrementally.
- Update providers to key off `activeSpaceId`: pins, categories, subscription, notifications, stats, timeline, wishlist.
- Add a space switcher and space setup flow.
- Replace `CoupleSetup` with a space setup/onboarding component.
- Rename user-facing copy through the i18n dictionary rather than hardcoding replacements.

Backend:

- Add `spaces` and `space_members`.
- Backfill existing data.
- Add `space_id` columns and indexes to existing space-scoped tables.
- Add space membership RLS helpers and policies.
- Add or update RPCs for space creation, invite, join, active context, and owner actions.
- Update Edge Functions to use `space_id` or space-aware compatibility lookups.

## Rollout Plan

1. Add schema and compatibility helpers.
2. Backfill old couple data into spaces.
3. Add frontend space context while preserving current app behavior for migrated users.
4. Enable personal-space onboarding so solo users can enter the map.
5. Add invite flow from personal space and shared setup flow.
6. Update settings, copy, landing, legal text, and notifications.
7. Gate duo-only features by member count.
8. Move remaining code paths from `couple_id` naming to `space_id`.
9. After stabilization, plan a cleanup migration to remove legacy couple-only assumptions.

## Edge Cases

- Invite code not found: show a clear invalid-code message.
- Space already has two members in current UI: show that this version supports up to two people.
- Space has five active members at the backend: RPC rejects the join.
- Owner deletes a space: require strong confirmation; delete all memories, media references, comments, reactions, wishlist, streak data, and subscriptions tied to that space.
- Member leaves a shared space: remove only that member. Shared data remains unless the owner deletes the space.
- Creator opens a shared invite before the second member joins: they can use the map normally.
- Personal space push notifications: do not generate partner/member notifications for the creator's own actions.
- Duo features in personal space: hidden and background reminders disabled.

## Testing

Database and RLS:

- `is_space_member` permits members and rejects non-members.
- Members can CRUD pins in their spaces and cannot access other spaces.
- Owners can delete/rename their spaces; non-owners cannot.
- `join_space_by_invite` rejects invalid codes and full spaces.
- Migration preserves pin and media counts from old couples.

Frontend contracts:

- New user choosing **Bản đồ của tôi** reaches the map without pairing.
- New user choosing **Dùng cùng người khác** can create an invite or join with a code.
- Solo user inviting another person sees the share-all confirmation before invite creation.
- Space switcher changes active map data.
- Streak and nudge are hidden for one-member spaces and visible for two-member spaces.
- UI blocks adding a third member in the first release.

Build and regression:

- `npm run build`
- Existing contract scripts affected by auth/session, setup, map, timeline, notifications, and couple breakup should be updated or replaced with space equivalents.

## Success Criteria

- A new user can sign up, choose **Bản đồ của tôi**, and immediately add memories.
- A new or existing user can invite one other person into a shared space.
- Existing couple data migrates into shared spaces without losing memories or media.
- The app no longer presents itself as couple-only in the primary experience.
- Backend membership is space-based and ready for up to five members per space.
- The first UI release still limits shared spaces to two people.
