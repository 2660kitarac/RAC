/**
 * 例会レジュメ本体（A4縦・2ページ構成）
 *
 * 画面のプレビューと印刷の両方で同じものを使う。
 * フックを使わない純粋な表示部品なので、サーバー／クライアントどちらからも読み込める。
 */
import {
  VISITOR_CATEGORY_LABELS,
  VISITOR_CATEGORY_ORDER,
  type ResumeView,
  type VisitorCategory,
} from '@/lib/resume/types';
import { districtHeading, positionTone } from '@/lib/resume/format';

const MARK_LABEL = { present: '○', absent: '×', none: '−' } as const;

function categoryHeading(cat: VisitorCategory, district: string | null) {
  return cat === 'district' ? districtHeading(district) : VISITOR_CATEGORY_LABELS[cat];
}

export default function ResumeDocument({ view }: { view: ResumeView }) {
  const { settings, club } = view;
  const visibleVisitors = view.visitors.filter(v => !v.hidden && v.name.trim());
  const visibleNext = view.nextMeetings.filter(n => !n.hidden);
  const shortHeader = `${club.name}　${view.meeting.meetingNumber ? `第${view.meeting.meetingNumber}回例会` : view.meeting.title}`;

  return (
    <div className="rs-doc">
      <style>{RESUME_CSS}</style>

      {/* ===================== 1ページ目 ===================== */}
      <section className="rs-page">
        <header className="rs-header">
          <div className="rs-header-text">
            {settings.headerLabel && <p className="rs-header-label">{settings.headerLabel}</p>}
            <p className="rs-club">
              {club.name}
              {settings.sponsorName && <span className="rs-sponsor">（提唱：{settings.sponsorName}）</span>}
            </p>
            <p className="rs-header-line">{view.headerLine}</p>
          </div>
          {settings.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="rs-logo" src={settings.logoUrl} alt="" />
          )}
        </header>
        <div className="rs-double-rule" />

        <div className="rs-title-block">
          <p className="rs-year">{view.yearLabel}</p>
          <h1 className="rs-title">{view.title}</h1>
        </div>

        <div className="rs-columns">
          <div className="rs-col">
            <h2 className="rs-h2">■ 本日のプログラム</h2>
            <ol className="rs-program">
              {view.programItems.map((item, i) => (
                <li key={i}>
                  <span className="rs-program-no">{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ol>

            {view.showSongs && settings.anthemText.trim() && (
              <>
                <h3 className="rs-h3">■ 『{settings.anthemTitle || '国歌'}』</h3>
                <p className="rs-lyrics">{settings.anthemText}</p>
              </>
            )}
            {view.showSongs && settings.songText.trim() && (
              <>
                <h3 className="rs-h3">■ 『{settings.songTitle || 'ソング'}』</h3>
                <p className="rs-lyrics">{settings.songText}</p>
              </>
            )}
          </div>

          <div className="rs-col">
            <h2 className="rs-h2">■ ビジター紹介</h2>
            {visibleVisitors.length === 0 ? (
              <p className="rs-empty">（ビジターの登録はありません）</p>
            ) : (
              VISITOR_CATEGORY_ORDER.map(cat => {
                const list = visibleVisitors.filter(v => v.category === cat);
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="rs-visitor-group">
                    <p className="rs-visitor-cat">【{categoryHeading(cat, club.district)}】</p>
                    <table className="rs-visitor-table">
                      <tbody>
                        {list.map(v => (
                          <tr key={v.key}>
                            <td className="rs-v-club">{v.clubName}</td>
                            <td className="rs-v-pos">{v.position}</td>
                            <td className="rs-v-name">{v.name}</td>
                            <td className="rs-v-sama">様</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* ===================== 2ページ目 ===================== */}
      <section className="rs-page rs-page-break">
        <header className="rs-p2-header">
          <p className="rs-p2-title">幹事連絡 ／ 会員名簿</p>
          <p className="rs-p2-sub">{shortHeader}</p>
        </header>

        {(visibleNext.length > 0 || view.secretaryNote.trim()) && (
          <>
            <h2 className="rs-h2 rs-bar">■ 幹事連絡</h2>
            {visibleNext.length > 0 && (
              <div className="rs-next-grid" style={{ gridTemplateColumns: `repeat(${Math.min(visibleNext.length, 2)}, 1fr)` }}>
                {visibleNext.map(n => (
                  <div key={n.id} className="rs-next-box">
                    <p className="rs-next-label">◇ {n.label} ◇</p>
                    <p className="rs-next-date">{n.dateLabel}</p>
                    <p className="rs-next-title">『{n.title}』</p>
                    {n.content && <p className="rs-next-content">【内容】{n.content}</p>}
                  </div>
                ))}
              </div>
            )}
            {view.secretaryNote.trim() && <p className="rs-note">{view.secretaryNote}</p>}
          </>
        )}

        <div className="rs-roster-bar">
          <span>■ {club.name}　会員紹介</span>
          {view.showAttendance && (
            <span className="rs-roster-stats">
              会員数 {view.stats.memberCount}名　／　出席 {view.stats.presentCount}名
              {view.stats.rate !== null && `（出席率 ${view.stats.rate}%）`}
            </span>
          )}
        </div>

        <div className="rs-roster">
          {view.members.map(m => (
            <div key={m.userId} className="rs-card">
              <div className="rs-photo-col">
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="rs-photo" src={m.photoUrl} alt="" />
                ) : (
                  <div className="rs-photo rs-photo-empty">{m.name.slice(0, 1)}</div>
                )}
                {m.company && <p className="rs-company">{m.company}</p>}
              </div>
              <div className="rs-info">
                <p className="rs-name">
                  {m.name}
                  {m.nameEn && <span className="rs-name-en">{m.nameEn}</span>}
                </p>
                {m.position && <p className={`rs-chip rs-chip-${positionTone(m.position)}`}>{m.position}</p>}
                {m.committee && <p className={`rs-chip rs-chip-${positionTone(m.committee) === 'chair' ? 'chair' : 'plain'}`}>{m.committee}</p>}
                {view.showAttendance && (
                  <p className="rs-mark">
                    出欠：<span className={`rs-mark-${m.mark}`}>{MARK_LABEL[m.mark]}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="rs-footer">
          {view.showAttendance && '○：出席　×：欠席　−：未回答　／　'}
          {club.name}　{view.meeting.meetingNumber ? `第${view.meeting.meetingNumber}回 ` : ''}{view.sessionLabel}『{view.title}』
        </p>
      </section>
    </div>
  );
}

/* 印刷時の見た目を固定するため、Tailwind ではなく専用の CSS を持つ */
const RESUME_CSS = `
.rs-doc { color: #1f2937; font-feature-settings: "palt"; }
.rs-page { width: 190mm; min-height: 277mm; margin: 0 auto; background: #fff; box-sizing: border-box; padding: 6mm 4mm; }
.rs-doc p, .rs-doc h1, .rs-doc h2, .rs-doc h3, .rs-doc ol { margin: 0; }

.rs-header { display: flex; align-items: center; justify-content: space-between; gap: 6mm; }
.rs-header-text { flex: 1; text-align: center; }
.rs-header-label { font-size: 9pt; }
.rs-club { font-size: 13pt; font-weight: 700; margin-top: 1mm !important; }
.rs-sponsor { font-size: 9pt; font-weight: 400; margin-left: 2mm; }
.rs-header-line { font-size: 9pt; margin-top: 1mm !important; }
.rs-logo { max-height: 24mm; max-width: 45mm; object-fit: contain; }
.rs-double-rule { border-top: 1.2pt solid #222; border-bottom: 1.2pt solid #222; height: 1.6mm; margin: 4mm 0 5mm; }

.rs-title-block { text-align: center; margin-bottom: 7mm; }
.rs-year { font-size: 9.5pt; font-weight: 700; letter-spacing: 0.25em; }
.rs-title { font-size: 20pt; font-weight: 800; letter-spacing: 0.3em; margin-top: 1mm !important; }

.rs-columns { display: grid; grid-template-columns: 1fr 1.15fr; gap: 8mm; }
.rs-h2 { font-size: 11pt; font-weight: 700; border-left: 1.2mm solid #222; padding-left: 2mm; margin-bottom: 3mm !important; }
.rs-h3 { font-size: 10pt; font-weight: 700; border-bottom: 0.6pt dashed #999; padding-bottom: 1mm; margin: 5mm 0 2mm !important; }
.rs-program { list-style: none; padding: 0 0 0 3mm; }
.rs-program li { font-size: 10pt; line-height: 2.1; }
.rs-program-no { display: inline-block; min-width: 5mm; }
.rs-lyrics { white-space: pre-wrap; font-size: 9pt; line-height: 1.9; padding-left: 3mm; }

.rs-empty { font-size: 9pt; color: #6b7280; }
.rs-visitor-group { margin-bottom: 4mm; }
.rs-visitor-cat { background: #f1f1f1; border-left: 1mm solid #555; font-size: 9.5pt; font-weight: 700; padding: 1.2mm 2mm; margin-bottom: 1.5mm !important; }
.rs-visitor-table { width: 100%; border-collapse: collapse; }
.rs-visitor-table td { font-size: 8.5pt; padding: 0.9mm 0.5mm; vertical-align: top; }
.rs-v-club { width: 32%; }
.rs-v-pos { width: 24%; color: #555; font-size: 7.5pt !important; }
.rs-v-name { font-size: 9.5pt !important; }
.rs-v-sama { width: 6mm; text-align: right; }

.rs-p2-header { text-align: center; border-bottom: 1pt solid #222; padding-bottom: 2mm; margin-bottom: 4mm; }
.rs-p2-title { font-size: 13pt; font-weight: 700; }
.rs-p2-sub { font-size: 8.5pt; color: #555; margin-top: 0.5mm !important; }
.rs-next-grid { display: grid; gap: 5mm; margin-bottom: 3mm; }
.rs-next-box { border: 0.8pt solid #333; border-radius: 3mm; padding: 2.5mm 3mm; text-align: center; }
.rs-next-label { color: #c0392b; font-weight: 700; font-size: 9.5pt; }
.rs-next-date { font-weight: 700; font-size: 10pt; margin-top: 0.8mm !important; }
.rs-next-title { font-weight: 700; font-size: 9.5pt; margin-top: 0.8mm !important; }
.rs-next-content { font-size: 8pt; text-align: left; margin-top: 1mm !important; line-height: 1.5; }
.rs-note { white-space: pre-wrap; font-size: 8.5pt; border: 0.6pt dashed #999; border-radius: 2mm; padding: 2mm 3mm; margin-bottom: 3mm !important; }

.rs-roster-bar { display: flex; justify-content: space-between; align-items: center; gap: 4mm; background: #2e3b4e; color: #fff; font-weight: 700; font-size: 10pt; padding: 2mm 3mm; margin: 3mm 0 3mm; }
.rs-roster-stats { font-weight: 400; font-size: 8.5pt; }
.rs-roster { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; }
.rs-card { display: flex; gap: 2mm; border: 0.6pt solid #bbb; border-radius: 2mm; padding: 2mm; break-inside: avoid; page-break-inside: avoid; min-height: 30mm; }
.rs-photo-col { width: 21mm; flex-shrink: 0; }
.rs-photo { width: 21mm; height: 24mm; object-fit: cover; border-radius: 1mm; display: block; }
.rs-photo-empty { background: #e5e7eb; color: #9ca3af; display: flex; align-items: center; justify-content: center; font-size: 14pt; font-weight: 700; }
.rs-company { font-size: 5.5pt; color: #444; margin-top: 0.8mm !important; line-height: 1.3; word-break: break-all; }
.rs-info { flex: 1; min-width: 0; }
.rs-name { font-size: 10pt; font-weight: 700; line-height: 1.3; }
.rs-name-en { font-size: 5.5pt; font-weight: 400; color: #666; margin-left: 1mm; }
.rs-chip { display: block; font-size: 6.5pt; font-weight: 700; text-align: center; border-radius: 0.8mm; padding: 0.4mm 1mm; margin-top: 0.8mm !important; }
.rs-chip-officer { background: #f4b09c; }
.rs-chip-district { background: #9fd0ee; }
.rs-chip-chair { background: #a9d9a0; }
.rs-chip-plain { background: #e3e3e3; }
.rs-mark { font-size: 8pt; margin-top: 1.5mm !important; }
.rs-mark-present { color: #16a34a; font-weight: 700; }
.rs-mark-absent { color: #dc2626; font-weight: 700; }
.rs-mark-none { color: #9ca3af; }
.rs-footer { text-align: center; font-size: 7.5pt; color: #555; border-top: 0.6pt dashed #999; padding-top: 1.5mm; margin-top: 4mm !important; }

/* 画面プレビュー：紙のように見せる */
@media screen {
  .rs-page { box-shadow: 0 1px 4px rgba(0,0,0,.12); margin-bottom: 8mm; }
}

@media print {
  @page { size: A4 portrait; margin: 10mm; }
  .rs-page { box-shadow: none; padding: 0; min-height: 0; }
  .rs-page-break { break-before: page; page-break-before: always; }
  .rs-doc { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
