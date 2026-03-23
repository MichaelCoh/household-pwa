import { Link } from 'react-router-dom'

const FEATURES = [
  { icon: '🛒', title: 'רשימות קניות חכמות', text: 'ניהול רשימות משותפות בזמן אמת, כולל התקדמות וסנכרון מיידי בין בני הבית.' },
  { icon: '✅', title: 'משימות עם אחריות', text: 'חלוקת משימות למשפחה, תאריכי יעד, סטטוסים והתראות שיעזרו לסגור קצוות.' },
  { icon: '📅', title: 'לוח שנה משפחתי', text: 'אירועים, תזכורות וסנכרון שגרה במקום אחד, כדי למנוע הפתעות של הרגע האחרון.' },
  { icon: '💳', title: 'שליטה בתקציב', text: 'מעקב הכנסות/הוצאות, תמונת מצב חודשית ותובנות פשוטות להחלטות טובות יותר.' },
  { icon: '👶', title: 'ניהול ילדים', text: 'תיעוד האכלות, חיתולים ולוגים יומיים עם סנכרון מלא בין הורים ומטפלים.' },
  { icon: '🔔', title: 'PWA והתראות', text: 'אפליקציה מהירה, ניתנת להתקנה, עם עדכונים שקטים והתראות פוש לפי קטגוריות.' },
]

const STEPS = [
  { num: '01', title: 'נרשמים ב-30 שניות', text: 'פותחים בית חדש או מצטרפים עם קוד הזמנה.' },
  { num: '02', title: 'מארגנים את הבית', text: 'יוצרים רשימות, משימות ואירועים לפי סדר העדיפויות שלכם.' },
  { num: '03', title: 'חוסכים זמן וכסף', text: 'פחות כפילויות, פחות פספוסים, יותר שליטה בשגרה המשפחתית.' },
]

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-hero">
        <div className="landing-nav">
          <div className="landing-brand">🏠 הבית שלי</div>
          <Link to="/" className="btn btn-ghost btn-sm">להתחברות</Link>
        </div>

        <div className="landing-hero-inner">
          <p className="landing-kicker">Family Operating System</p>
          <h1 className="landing-title">האפליקציה שמסדרת את כל ניהול הבית במקום אחד</h1>
          <p className="landing-subtitle">
            פחות עומס מנטלי, פחות הודעות בוואטסאפ, יותר שקט למשפחה.
            הכל מסונכרן בזמן אמת: קניות, משימות, לוח שנה, תקציב ומעקב ילדים.
          </p>
          <div className="landing-cta-row">
            <Link to="/" className="btn btn-primary">התחל עכשיו</Link>
            <a href="#features" className="btn btn-ghost">ראה יכולות</a>
          </div>
          <div className="landing-proof">
            <span>⚡ PWA מהיר</span>
            <span>🔒 Supabase + RLS</span>
            <span>📲 עובד כמו אפליקציה</span>
          </div>
        </div>
      </header>

      <section id="features" className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">יכולות מרכזיות</p>
          <h2>תשתית אחת לכל מה שמשפחה מודרנית צריכה</h2>
        </div>
        <div className="landing-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="landing-card">
              <div className="landing-card-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">איך זה עובד</p>
          <h2>בונים הרגלי בית טובים בשלושה צעדים</h2>
        </div>
        <div className="landing-steps">
          {STEPS.map((s) => (
            <div key={s.num} className="landing-step">
              <div className="landing-step-num">{s.num}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-investor">
        <div className="landing-section-head">
          <p className="landing-kicker">למשקיעים ושותפים</p>
          <h2>קטגוריה ענקית, מוצר עם שימוש יומיומי ודאטה עשיר</h2>
        </div>
        <div className="landing-investor-grid">
          <div className="landing-card">
            <h3>Retention טבעי</h3>
            <p>ניהול בית הוא צורך יומיומי, ולכן תדירות שימוש גבוהה מייצרת LTV פוטנציאלי חזק.</p>
          </div>
          <div className="landing-card">
            <h3>Monetization ברור</h3>
            <p>Freemium + מנוי משפחתי + חבילות פרימיום פונקציונליות מגדילים ARPU מהר.</p>
          </div>
          <div className="landing-card">
            <h3>סקייל מהיר</h3>
            <p>PWA מאפשר הפצה מיידית, עלויות תפעול נמוכות וזמן פיתוח קצר לשיפורים.</p>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <h2>מוכנים לשדרג את ניהול הבית?</h2>
        <p>התחילו בחינם, הוסיפו בני משפחה, ותראו שיפור כבר בשבוע הראשון.</p>
        <Link to="/" className="btn btn-primary">התחברות / הרשמה</Link>
      </section>
    </div>
  )
}
