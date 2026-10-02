/**
 * 例会フォーム用のデータ変換ヘルパー
 *
 * Drizzle は camelCase で返すが MeetingForm は snake_case を期待するため変換する。
 * （変換がないと料金・懇親会・定員などが初期値として入らない）
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MeetingRow = Record<string, any>;

export function toMeetingFormValues(m: MeetingRow) {
  return {
    ...m,
    meeting_number:               m.meetingNumber,
    start_time:                   m.startTime,
    end_time:                     m.endTime,
    venue_name:                   m.venueName,
    venue_address:                m.venueAddress,
    manager_user_id:              m.managerUserId,
    program_detail:               m.programDetail,
    registration_deadline:        m.registrationDeadline,
    deadline_policy:              m.deadlinePolicy ?? 'flexible',
    fee_rac:                      m.feeRac,
    fee_rc:                       m.feeRc,
    fee_obog:                     m.feeObog,
    fee_guest:                    m.feeGuest,
    meal_fee:                     m.mealFee,
    mu_registration_slug:         m.muRegistrationSlug,
    mu_registration_url:          m.muRegistrationUrl,
    is_district_event:            m.isDistrictEvent,
    own_club_fee:                 m.ownClubFee ?? null,
    has_after_party:              m.hasAfterParty,
    after_party_venue:            m.afterPartyVenue,
    after_party_start_time:       m.afterPartyStartTime,
    after_party_fee_type:         m.afterPartyFeeType,
    after_party_fee_rac:          m.afterPartyFeeRac,
    after_party_fee_rc:           m.afterPartyFeeRc,
    after_party_fee_obog:         m.afterPartyFeeObog,
    after_party_fee_guest:        m.afterPartyFeeGuest,
    after_party_allow_party_only: m.afterPartyAllowPartyOnly,
    after_party_capacity:         m.afterPartyCapacity,
  };
}

/**
 * 過去例会を「新規作成フォームの初期値」に変換する。
 *
 * - 開催日・登録締切日はクリア（必ず再設定してもらう）
 * - ステータスは下書き、MU登録URL / 終了処理情報は引き継がない
 * - 例会番号はコピー元 +1 を提案し、例会名中の「第N例会」も追従させる
 * - 担当者が現在のメンバーにいなければクリア
 */
export function toCopiedMeetingFormValues(
  source: MeetingRow,
  validMemberIds: string[],
) {
  const base = toMeetingFormValues(source);

  const srcNumber: number | null =
    typeof source.meetingNumber === 'number' ? source.meetingNumber : null;
  const nextNumber = srcNumber != null ? srcNumber + 1 : null;

  let title: string = source.title ?? '';
  if (srcNumber != null && nextNumber != null) {
    // 「第12例会」「第12回例会」などの番号部分のみ置換
    title = title.replace(new RegExp(`第\\s*${srcNumber}(?!\\d)`), `第${nextNumber}`);
  }

  const managerId =
    source.managerUserId && validMemberIds.includes(source.managerUserId)
      ? source.managerUserId
      : '';

  return {
    ...base,
    id: undefined,
    title,
    meeting_number: nextNumber,
    date: '',
    registration_deadline: '',
    status: 'draft',
    manager_user_id: managerId,
    mu_registration_slug: null,
    mu_registration_url: null,
    finishedAt: null,
    finishedBy: null,
    closingNote: null,
    attendanceFinalized: false,
  };
}
