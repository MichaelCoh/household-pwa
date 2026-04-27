import { Modal } from '../UI'

/**
 * One-time disclosure shown before the user connects ANY calendar tier.
 * Stays mounted by the parent (SettingsPage) until the user accepts;
 * acceptance is persisted via acknowledgePrivacy() in calendar/connection.js.
 */
export default function CalendarPrivacyDisclosure({ open, onAccept, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="חיבור יומן — מה נשתף?"
      onSubmit={onAccept}
      submitLabel="אני מבין/ה ואני מאשר/ת"
      submitColor="var(--sky)"
    >
      <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-primary)' }}>
        <p style={{ marginBottom: '12px' }}>
          לפני חיבור יומן הטלפון שלך לאפליקציה, חשוב להבין מה ייצא ומה לא:
        </p>

        <div style={{
          padding: '12px 14px',
          background: 'var(--mint-light)',
          color: 'var(--mint)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '12px',
          fontSize: '13px',
        }}>
          <strong style={{ display: 'block', marginBottom: '4px' }}>✅ ייצא ליומן:</strong>
          <span style={{ color: 'var(--text-primary)' }}>
            אירועים בלוח השנה ומשימות עם תאריך יעד בלבד.
          </span>
        </div>

        <div style={{
          padding: '12px 14px',
          background: 'var(--coral-light)',
          color: 'var(--coral)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '12px',
          fontSize: '13px',
        }}>
          <strong style={{ display: 'block', marginBottom: '4px' }}>⛔ לעולם לא ייצא:</strong>
          <span style={{ color: 'var(--text-primary)' }}>
            יומן תינוק (האכלות, חיתולים), תקציב, רשימות קניות, או נתונים רפואיים.
          </span>
        </div>

        <div style={{
          padding: '12px 14px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '12px',
          fontSize: '13px',
          border: '1px solid var(--border)',
        }}>
          <strong style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)' }}>
            🔐 אבטחת מידע
          </strong>
          <ul style={{ paddingRight: '18px', margin: 0, color: 'var(--text-secondary)' }}>
            <li>אסימוני Google מאוחסנים בשרת בלבד, לעולם לא נחשפים בדפדפן.</li>
            <li>קישור webcal מאובטח בקוד אקראי וניתן לרענון בכל רגע.</li>
            <li>אפשר להתנתק בכל עת — כל המידע שיובא יימחק.</li>
          </ul>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
          ניתן לשנות את ההגדרות, לרענן קישורים או להתנתק מתוך הגדרות → חיבור יומן בכל זמן.
        </p>
      </div>
    </Modal>
  )
}
